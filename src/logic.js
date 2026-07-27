const sides = ["top", "right", "bottom", "left"];

export function cleanRut(value = "") {
  return String(value).replace(/[^0-9kK]/g, "").toUpperCase();
}

export function validateRut(value) {
  const rut = cleanRut(value);
  if (rut.length < 8) return false;
  const body = rut.slice(0, -1);
  const verifier = rut.slice(-1);
  let sum = 0;
  let multiplier = 2;
  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const result = 11 - (sum % 11);
  const expected = result === 11 ? "0" : result === 10 ? "K" : String(result);
  return verifier === expected;
}

export function formatRut(value) {
  const rut = cleanRut(value);
  if (rut.length < 2) return rut;
  const body = rut.slice(0, -1);
  return `${Number(body).toLocaleString("es-CL")}-${rut.slice(-1)}`;
}

export function cutDimensions(piece, edgeBands) {
  const edge = (side) =>
    edgeBands.find((item) => item.id === piece.edges?.[side])?.thickness ?? 0;
  return {
    cutLength: Math.max(1, piece.length - edge("left") - edge("right")),
    cutWidth: Math.max(1, piece.width - edge("top") - edge("bottom")),
  };
}

export function pieceFitsMaterial(piece, material) {
  if (!material) return false;
  const length = Number(piece.length);
  const width = Number(piece.width);
  if (length <= 0 || width <= 0) return false;
  const direct =
    length <= material.plateLength && width <= material.plateWidth;
  const rotated =
    width <= material.plateLength && length <= material.plateWidth;
  if (piece.grain === "longitudinal") return direct;
  if (piece.grain === "transversal") return rotated;
  return direct || rotated;
}

function orientations(piece, cut) {
  if (piece.grain === "longitudinal") {
    return [{ w: cut.cutLength, h: cut.cutWidth, rotated: false }];
  }
  if (piece.grain === "transversal") {
    return [{ w: cut.cutWidth, h: cut.cutLength, rotated: true }];
  }
  return [
    { w: cut.cutLength, h: cut.cutWidth, rotated: false },
    { w: cut.cutWidth, h: cut.cutLength, rotated: true },
  ].sort((a, b) => a.h - b.h || b.w - a.w);
}

function makePlate(index, cutAxis = "longitudinal") {
  return { index, cutAxis, strips: [], pieces: [], usedArea: 0 };
}

function findPlacement(plate, candidates, material, kerf) {
  for (const strip of plate.strips) {
    for (const candidate of candidates) {
      const x = strip.usedLength ? strip.usedLength + kerf : 0;
      if (
        candidate.h <= strip.height &&
        x + candidate.w <= material.plateLength
      ) {
        return { strip, x, y: strip.y, ...candidate };
      }
    }
  }

  const y = plate.strips.length
    ? plate.strips.at(-1).y + plate.strips.at(-1).height + kerf
    : 0;
  for (const candidate of candidates) {
    if (
      candidate.w <= material.plateLength &&
      y + candidate.h <= material.plateWidth
    ) {
      const strip = {
        y,
        height: candidate.h,
        usedLength: 0,
        pieces: [],
      };
      plate.strips.push(strip);
      return { strip, x: 0, y, ...candidate };
    }
  }
  return null;
}

function packLayout(material, expanded, settings, cutAxis) {
  const warnings = [];
  const plates = [];
  const virtualMaterial =
    cutAxis === "transversal"
      ? {
          ...material,
          plateLength: material.plateWidth,
          plateWidth: material.plateLength,
        }
      : material;
  for (const piece of expanded) {
    const candidates = orientations(piece, piece).map((candidate) =>
      cutAxis === "transversal"
        ? {
            w: candidate.h,
            h: candidate.w,
            rotated: candidate.rotated,
          }
        : candidate,
    );
    let placement = null;
    let targetPlate = null;
    for (const plate of plates) {
      placement = findPlacement(
        plate,
        candidates,
        virtualMaterial,
        settings.kerf,
      );
      if (placement) {
        targetPlate = plate;
        break;
      }
    }
    if (!placement) {
      targetPlate = makePlate(plates.length + 1, cutAxis);
      placement = findPlacement(
        targetPlate,
        candidates,
        virtualMaterial,
        settings.kerf,
      );
      if (placement) plates.push(targetPlate);
    }
    if (!placement || !targetPlate) {
      warnings.push(
        `${piece.code || piece.name}: la pieza no cabe en la placa seleccionada.`,
      );
      continue;
    }
    const actualPlacement =
      cutAxis === "transversal"
        ? {
            x: placement.y,
            y: placement.x,
            w: placement.h,
            h: placement.w,
          }
        : {
            x: placement.x,
            y: placement.y,
            w: placement.w,
            h: placement.h,
          };
    const placed = {
      ...piece,
      plateIndex: targetPlate.index,
      x: actualPlacement.x,
      y: actualPlacement.y,
      drawWidth: actualPlacement.w,
      drawHeight: actualPlacement.h,
      rotated: placement.rotated,
      stripIndex: targetPlate.strips.indexOf(placement.strip),
    };
    placement.strip.pieces.push(placed);
    placement.strip.usedLength = placement.x + placement.w;
    targetPlate.pieces.push(placed);
    targetPlate.usedArea += actualPlacement.w * actualPlacement.h;
  }
  return { plates, warnings };
}

export function optimize(material, pieces, edgeBands, settings = {}) {
  const normalizedSettings = {
    kerf: Math.max(0, Number(settings.kerf) || 0),
    cutRatePerBoard: Math.max(
      0,
      Number(settings.cutRatePerBoard ?? settings.cutRate) || 0,
    ),
    optimizationMode:
      settings.optimizationMode === "free" ? "free" : "longitudinal",
    boardDiscount: Math.min(100, Math.max(0, Number(settings.boardDiscount) || 0)),
    edgeDiscount: Math.min(100, Math.max(0, Number(settings.edgeDiscount) || 0)),
    servicesDiscount: Math.min(
      100,
      Math.max(0, Number(settings.servicesDiscount) || 0),
    ),
  };
  const expanded = pieces
    .flatMap((piece) =>
      Array.from(
        { length: Math.max(1, Number(piece.quantity) || 1) },
        (_, index) => ({
          ...piece,
          instanceId: `${piece.id}-${index + 1}`,
          ...cutDimensions(piece, edgeBands),
        }),
      ),
    )
    .sort(
      (a, b) =>
        Math.max(b.cutLength, b.cutWidth) - Math.max(a.cutLength, a.cutWidth),
    );

  const layouts = [
    packLayout(material, expanded, normalizedSettings, "longitudinal"),
  ];
  if (normalizedSettings.optimizationMode === "free") {
    layouts.push(
      packLayout(material, expanded, normalizedSettings, "transversal"),
    );
  }
  const cutCountFor = (layout) =>
    layout.plates.reduce(
      (total, plate) => total + plate.strips.length + plate.pieces.length,
      0,
    );
  layouts.sort(
    (a, b) =>
      a.warnings.length - b.warnings.length ||
      a.plates.length - b.plates.length ||
      cutCountFor(a) - cutCountFor(b),
  );
  const { plates, warnings } = layouts[0];
  const plateArea = material.plateLength * material.plateWidth;
  for (const plate of plates) {
    plate.utilization = plateArea ? (plate.usedArea / plateArea) * 100 : 0;
  }

  const metersByEdge = {};
  let edgeMeters = 0;
  for (const piece of pieces) {
    for (const side of sides) {
      const edgeId = piece.edges?.[side];
      if (!edgeId) continue;
      const meters =
        ((side === "top" || side === "bottom" ? piece.length : piece.width) *
          piece.quantity) /
        1000;
      edgeMeters += meters;
      metersByEdge[edgeId] = (metersByEdge[edgeId] ?? 0) + meters;
    }
  }

  const boardSubtotal = plates.length * material.netPrice;
  const edgeSubtotal = Object.entries(metersByEdge).reduce((total, [id, meters]) => {
    const price = edgeBands.find((item) => item.id === id)?.price ?? 0;
    return total + meters * price;
  }, 0);
  const cutCount = plates.reduce(
    (total, plate) => total + plate.strips.length + plate.pieces.length,
    0,
  );
  const cuttingSubtotal = plates.length * normalizedSettings.cutRatePerBoard;
  const bandingSubtotal = Object.entries(metersByEdge).reduce(
    (total, [id, meters]) => {
      const rate = edgeBands.find((item) => item.id === id)?.serviceRate ?? 0;
      return total + meters * rate;
    },
    0,
  );
  const servicesSubtotal = cuttingSubtotal + bandingSubtotal;
  const boardDiscountAmount =
    boardSubtotal * (normalizedSettings.boardDiscount / 100);
  const edgeDiscountAmount =
    edgeSubtotal * (normalizedSettings.edgeDiscount / 100);
  const servicesDiscountAmount =
    servicesSubtotal * (normalizedSettings.servicesDiscount / 100);
  const discountTotal =
    boardDiscountAmount + edgeDiscountAmount + servicesDiscountAmount;
  const net =
    boardSubtotal + edgeSubtotal + servicesSubtotal - discountTotal;

  return {
    plates,
    warnings,
    summary: {
      boardCount: plates.length,
      cutCount,
      edgeMeters,
      boardSubtotal,
      edgeSubtotal,
      cuttingSubtotal,
      bandingSubtotal,
      servicesSubtotal,
      boardDiscount: normalizedSettings.boardDiscount,
      edgeDiscount: normalizedSettings.edgeDiscount,
      servicesDiscount: normalizedSettings.servicesDiscount,
      boardDiscountAmount,
      edgeDiscountAmount,
      servicesDiscountAmount,
      discountTotal,
      net,
      vat: net * 0.19,
      total: net * 1.19,
      waste:
        plates.length > 0
          ? 100 -
            (plates.reduce((sum, plate) => sum + plate.usedArea, 0) /
              (plates.length * plateArea)) *
              100
          : 0,
      metersByEdge,
    },
  };
}

function fittedText(ctx, value, maxWidth) {
  const text = String(value || "");
  if (ctx.measureText(text).width <= maxWidth) return text;
  let shortened = text;
  while (
    shortened.length > 1 &&
    ctx.measureText(`${shortened}…`).width > maxWidth
  ) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened}…`;
}

function edgeDash(edge) {
  if (edge.material === "ABS") return [14, 4, 3, 4];
  if (edge.material === "EGR") return [2, 4];
  if (edge.thickness <= 0.4) return [];
  if (edge.thickness <= 1) return [11, 4];
  if (edge.thickness <= 1.5) return [6, 3];
  return [17, 5];
}

function drawEdgeLine(ctx, edge, x1, y1, x2, y2) {
  const thickness = Number(edge.thickness) || 0.4;
  ctx.strokeStyle = "#101820";
  ctx.lineWidth =
    thickness >= 2 ? 9 : thickness >= 1.5 ? 7 : thickness >= 1 ? 5.5 : 4;
  ctx.setLineDash(edgeDash(edge));
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  if (thickness >= 2) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([]);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawCutTag(ctx, text, x, y, maxWidth = 160) {
  ctx.font = "700 9px Arial";
  const label = fittedText(ctx, text, maxWidth - 12);
  const tagWidth = Math.min(maxWidth, ctx.measureText(label).width + 12);
  ctx.fillStyle = "rgba(255,255,255,.94)";
  ctx.fillRect(x, y - 11, tagWidth, 15);
  ctx.fillStyle = "#101820";
  ctx.fillText(label, x + 6, y);
}

function spacedMarks(values, scale, minimumPixels = 28) {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  return sorted.reduce((marks, value, index) => {
    if (!marks.length) return [value];
    if ((value - marks.at(-1)) * scale >= minimumPixels) {
      marks.push(value);
    } else if (index === sorted.length - 1) {
      marks[marks.length - 1] = value;
    }
    return marks;
  }, []);
}

export function drawCutPlan(
  canvas,
  plate,
  material,
  edgeBands,
  logoImage,
  context = {},
) {
  const ctx = canvas.getContext("2d");
  const width = 1400;
  const height = 900;
  const margin = { left: 115, top: 188, right: 350, bottom: 82 };
  canvas.width = width;
  canvas.height = height;
  const scale = Math.min(
    (width - margin.left - margin.right) / material.plateLength,
    (height - margin.top - margin.bottom) / material.plateWidth,
  );
  const plateW = material.plateLength * scale;
  const plateH = material.plateWidth * scale;
  const ox = margin.left;
  const oy = margin.top;

  ctx.fillStyle = "#f6f5f2";
  ctx.fillRect(0, 0, width, height);
  if (logoImage?.complete && logoImage.naturalWidth) {
    ctx.drawImage(logoImage, 38, 24, 190, 68);
  } else {
    ctx.fillStyle = "#101820";
    ctx.font = "700 26px Arial";
    ctx.fillText("CASA DISEÑO", 38, 55);
  }
  const project = context.project || {};
  const headerX = 260;
  const headerWidth = 780;
  ctx.fillStyle = "#101820";
  ctx.font = "700 22px Arial";
  ctx.fillText("PLANO DE CORTE", headerX, 42);
  ctx.font = "700 13px Arial";
  ctx.fillText(
    fittedText(
      ctx,
      `PROYECTO: ${project.projectName || "Sin nombre"} · CLIENTE: ${
        project.clientName || "Sin identificar"
      }`,
      headerWidth,
    ),
    headerX,
    66,
  );
  ctx.font = "12px Arial";
  ctx.fillStyle = "#354352";
  ctx.fillText(
    fittedText(
      ctx,
      `COTIZACIÓN: ${context.projectId || "S/I"} · ESTADO: ${
        context.statusLabel || project.status || "Cotización"
      }${project.rut ? ` · RUT: ${project.rut}` : ""}`,
      headerWidth,
    ),
    headerX,
    88,
  );
  ctx.fillText(
    fittedText(
      ctx,
      `MATERIAL: ${material.brand} ${material.name} (${material.sku}) · ${
        material.plateLength
      } × ${material.plateWidth} × ${material.thickness} mm`,
      headerWidth,
    ),
    headerX,
    109,
  );
  ctx.fillText(
    fittedText(
      ctx,
      `PLACA ${plate.index} · PRIMER CORTE: ${
        plate.cutAxis === "transversal" ? "TRANSVERSAL" : "LONGITUDINAL"
      } · GENERADO: ${context.generatedAt || new Date().toLocaleString("es-CL")}${
        context.createdBy ? ` · RESPONSABLE: ${context.createdBy}` : ""
      }`,
      headerWidth,
    ),
    headerX,
    130,
  );
  ctx.strokeStyle = "#a9b0b7";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(38, 153);
  ctx.lineTo(width - 38, 153);
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#101820";
  ctx.lineWidth = 3;
  ctx.fillRect(ox, oy, plateW, plateH);
  ctx.strokeRect(ox, oy, plateW, plateH);

  plate.pieces.forEach((piece, index) => {
    const x = ox + piece.x * scale;
    const y = oy + piece.y * scale;
    const w = piece.drawWidth * scale;
    const h = piece.drawHeight * scale;
    ctx.fillStyle = index % 2 ? "#e7eaec" : "#d8dde0";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#59636d";
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.strokeRect(x, y, w, h);

    const originalEdges = piece.edges ?? {};
    const edges = piece.rotated
      ? {
          top: originalEdges.left,
          right: originalEdges.top,
          bottom: originalEdges.right,
          left: originalEdges.bottom,
        }
      : originalEdges;
    const edgeLines = [
      ["top", x, y, x + w, y],
      ["right", x + w, y, x + w, y + h],
      ["bottom", x, y + h, x + w, y + h],
      ["left", x, y, x, y + h],
    ];
    for (const [side, x1, y1, x2, y2] of edgeLines) {
      const edge = edgeBands.find((item) => item.id === edges[side]);
      if (!edge) continue;
      drawEdgeLine(ctx, edge, x1, y1, x2, y2);
    }
    ctx.setLineDash([]);

    ctx.fillStyle = "#101820";
    ctx.textAlign = "center";
    ctx.font = `700 ${Math.max(9, Math.min(15, h / 5))}px Arial`;
    const pieceLabel = piece.name
      ? `${piece.code || "S/C"} · ${piece.name}`
      : piece.code || "S/C";
    ctx.fillText(
      fittedText(ctx, pieceLabel, Math.max(25, w - 28)),
      x + w / 2,
      y + h / 2,
    );

    if (w > 48 && h > 36) {
      const horizontalMeasure = Math.round(piece.drawWidth);
      const verticalMeasure = Math.round(piece.drawHeight);
      ctx.fillStyle = "#101820";
      ctx.font = `700 ${w > 100 && h > 70 ? 10 : 8}px Arial`;
      ctx.textAlign = "center";
      ctx.fillText(`${horizontalMeasure}`, x + w / 2, y + 14, w - 28);
      ctx.fillText(`${horizontalMeasure}`, x + w / 2, y + h - 7, w - 28);
      ctx.save();
      ctx.translate(x + 13, y + h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(`${verticalMeasure}`, 0, 0, h - 28);
      ctx.restore();
      ctx.save();
      ctx.translate(x + w - 8, y + h / 2);
      ctx.rotate(Math.PI / 2);
      ctx.fillText(`${verticalMeasure}`, 0, 0, h - 28);
      ctx.restore();
    }

    if (piece.grain !== "sin-veta" && w > 70 && h > 55) {
      const horizontal = piece.grain === "longitudinal" !== piece.rotated;
      ctx.strokeStyle = "#4a535c";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      if (horizontal) {
        ctx.moveTo(x + w * 0.3, y + h * 0.7);
        ctx.lineTo(x + w * 0.7, y + h * 0.7);
        ctx.lineTo(x + w * 0.63, y + h * 0.64);
      } else {
        ctx.moveTo(x + w * 0.7, y + h * 0.7);
        ctx.lineTo(x + w * 0.7, y + h * 0.3);
        ctx.lineTo(x + w * 0.64, y + h * 0.37);
      }
      ctx.stroke();
    }
  });

  ctx.textAlign = "left";
  ctx.font = "10px Arial";
  ctx.strokeStyle = "#101820";
  ctx.fillStyle = "#101820";
  ctx.lineWidth = 2.2;
  ctx.setLineDash([14, 6]);
  for (const strip of plate.strips) {
    if (plate.cutAxis === "transversal") {
      const cutX = ox + (strip.y + strip.height) * scale;
      if (cutX < ox + plateW - 1) {
        ctx.beginPath();
        ctx.moveTo(cutX, oy);
        ctx.lineTo(cutX, oy + plateH);
        ctx.stroke();
        ctx.save();
        ctx.translate(cutX + 11, oy + plateH - 12);
        ctx.rotate(-Math.PI / 2);
        drawCutTag(ctx, "CORTE TRANSVERSAL COMPLETO", 0, 0, 170);
        ctx.restore();
      }
      for (const piece of strip.pieces) {
        const cutY = oy + (piece.y + piece.drawHeight) * scale;
        if (cutY < oy + plateH - 1) {
          ctx.strokeStyle = "#6b747d";
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.moveTo(ox + strip.y * scale, cutY);
          ctx.lineTo(ox + (strip.y + strip.height) * scale, cutY);
          ctx.stroke();
        }
      }
    } else {
      const cutY = oy + (strip.y + strip.height) * scale;
      if (cutY < oy + plateH - 1) {
        ctx.strokeStyle = "#101820";
        ctx.lineWidth = 2.2;
        ctx.setLineDash([14, 6]);
        ctx.beginPath();
        ctx.moveTo(ox, cutY);
        ctx.lineTo(ox + plateW, cutY);
        ctx.stroke();
        drawCutTag(
          ctx,
          "CORTE LONGITUDINAL COMPLETO",
          ox + plateW - 185,
          cutY - 3,
          180,
        );
      }
      for (const piece of strip.pieces) {
        const cutX = ox + (piece.x + piece.drawWidth) * scale;
        if (cutX < ox + plateW - 1) {
          ctx.strokeStyle = "#6b747d";
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.moveTo(cutX, oy + strip.y * scale);
          ctx.lineTo(cutX, oy + (strip.y + strip.height) * scale);
          ctx.stroke();
        }
      }
    }
  }
  ctx.setLineDash([]);

  const xMarks = spacedMarks(
    [
      0,
      material.plateLength,
      ...plate.pieces.flatMap((piece) => [
        piece.x,
        piece.x + piece.drawWidth,
      ]),
    ],
    scale,
  );
  const yMarks = spacedMarks(
    [
      0,
      material.plateWidth,
      ...plate.pieces.flatMap((piece) => [
        piece.y,
        piece.y + piece.drawHeight,
      ]),
    ],
    scale,
  );
  ctx.fillStyle = "#303a44";
  ctx.strokeStyle = "#59636d";
  ctx.font = "10px Arial";
  ctx.textAlign = "center";
  xMarks.forEach((value, index) => {
    const x = ox + value * scale;
    const level = index % 2;
    const tickTop = oy - (level ? 35 : 20);
    ctx.beginPath();
    ctx.moveTo(x, oy - 5);
    ctx.lineTo(x, tickTop);
    ctx.stroke();
    ctx.fillText(`${Math.round(value)}`, x, tickTop - 5);
  });
  ctx.save();
  ctx.textAlign = "right";
  yMarks.forEach((value, index) => {
    const y = oy + value * scale;
    const level = index % 2;
    const tickLeft = ox - (level ? 42 : 21);
    ctx.beginPath();
    ctx.moveTo(ox - 5, y);
    ctx.lineTo(tickLeft, y);
    ctx.stroke();
    ctx.fillText(`${Math.round(value)}`, tickLeft - 5, y + 3);
  });
  ctx.restore();

  const legendX = ox + plateW + 28;
  ctx.textAlign = "left";
  ctx.fillStyle = "#101820";
  ctx.font = "700 14px Arial";
  ctx.fillText("LEYENDA TAPACANTOS", legendX, oy + 24);
  const usedEdges = [...new Set(plate.pieces.flatMap((piece) => Object.values(piece.edges ?? {})).filter(Boolean))];
  usedEdges.forEach((id, index) => {
    const edge = edgeBands.find((item) => item.id === id);
    if (!edge) return;
    const y = oy + 52 + index * 31;
    drawEdgeLine(ctx, edge, legendX, y, legendX + 62, y);
    ctx.fillStyle = "#303a44";
    ctx.font = "10px Arial";
    ctx.fillText(
      fittedText(
        ctx,
        `${edge.material} ${String(edge.thickness).replace(".", ",")} mm · ${
          edge.sku
        } · ${edge.name}`,
        margin.right - 118,
      ),
      legendX + 76,
      y + 4,
    );
  });
  if (!usedEdges.length) {
    ctx.fillStyle = "#6b747d";
    ctx.font = "11px Arial";
    ctx.fillText("Sin tapacantos asignados", legendX, oy + 52);
  }

  ctx.fillStyle = "#58636d";
  ctx.font = "11px Arial";
  ctx.fillText(
    "Medidas interiores: parciales de pieza · Medidas exteriores: acumuladas · Unidades en mm.",
    39,
    height - 28,
  );
}

export function clp(value) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value || 0);
}
