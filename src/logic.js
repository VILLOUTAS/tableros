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

function lineDash(style) {
  if (style === "dashed") return [9, 5];
  if (style === "dashdot") return [9, 4, 2, 4];
  return [];
}

export function drawCutPlan(canvas, plate, material, edgeBands, logoImage) {
  const ctx = canvas.getContext("2d");
  const width = 1200;
  const height = 820;
  const margin = { left: 88, top: 94, right: 235, bottom: 82 };
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

  ctx.fillStyle = "#f7f4ed";
  ctx.fillRect(0, 0, width, height);
  if (logoImage?.complete && logoImage.naturalWidth) {
    ctx.drawImage(logoImage, 38, 13, 190, 68);
  } else {
    ctx.fillStyle = "#10243d";
    ctx.font = "700 26px Arial";
    ctx.fillText("CASA DISEÑO", 38, 42);
  }
  ctx.fillStyle = "#10243d";
  ctx.font = "700 18px Arial";
  ctx.fillText("PLANO DE CORTE", 250, 41);
  ctx.fillStyle = "#6f7782";
  ctx.font = "15px Arial";
  ctx.fillText(
    `${material.brand} ${material.name} · Placa ${plate.index} · ${material.plateLength} × ${material.plateWidth} mm`,
    250,
    65,
  );

  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#10243d";
  ctx.lineWidth = 3;
  ctx.fillRect(ox, oy, plateW, plateH);
  ctx.strokeRect(ox, oy, plateW, plateH);

  plate.pieces.forEach((piece, index) => {
    const x = ox + piece.x * scale;
    const y = oy + piece.y * scale;
    const w = piece.drawWidth * scale;
    const h = piece.drawHeight * scale;
    ctx.fillStyle = index % 2 ? "#e8edf1" : "#dce6ec";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#52677c";
    ctx.lineWidth = 1.2;
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
      ctx.strokeStyle = edge.color;
      ctx.lineWidth = edge.style === "double" ? 7 : 5;
      ctx.setLineDash(lineDash(edge.style));
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      if (edge.style === "double") {
        ctx.strokeStyle = "#10243d";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    ctx.fillStyle = "#10243d";
    ctx.textAlign = "center";
    ctx.font = `${Math.max(10, Math.min(16, h / 4))}px Arial`;
    ctx.fillText(
      `${piece.code || "S/C"} · ${piece.name}`,
      x + w / 2,
      y + h / 2 - 5,
      Math.max(25, w - 8),
    );
    ctx.font = "12px Arial";
    ctx.fillText(
      `${Math.round(piece.cutLength)} × ${Math.round(piece.cutWidth)} mm`,
      x + w / 2,
      y + h / 2 + 14,
      Math.max(25, w - 8),
    );

    if (w > 54 && h > 42) {
      const horizontalMeasure = Math.round(piece.drawWidth);
      const verticalMeasure = Math.round(piece.drawHeight);
      ctx.fillStyle = "#405469";
      ctx.font = "700 9px Arial";
      ctx.textAlign = "center";
      ctx.fillText(`${horizontalMeasure}`, x + w / 2, y + 11, w - 20);
      ctx.fillText(`${horizontalMeasure}`, x + w / 2, y + h - 4, w - 20);
      ctx.save();
      ctx.translate(x + 10, y + h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(`${verticalMeasure}`, 0, 0, h - 20);
      ctx.restore();
      ctx.save();
      ctx.translate(x + w - 5, y + h / 2);
      ctx.rotate(Math.PI / 2);
      ctx.fillText(`${verticalMeasure}`, 0, 0, h - 20);
      ctx.restore();
    }

    if (piece.grain !== "sin-veta" && w > 42 && h > 24) {
      const horizontal = piece.grain === "longitudinal" !== piece.rotated;
      ctx.strokeStyle = "#b17b35";
      ctx.fillStyle = "#b17b35";
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (horizontal) {
        ctx.moveTo(x + w * 0.25, y + h * 0.75);
        ctx.lineTo(x + w * 0.75, y + h * 0.75);
        ctx.lineTo(x + w * 0.68, y + h * 0.68);
      } else {
        ctx.moveTo(x + w * 0.75, y + h * 0.75);
        ctx.lineTo(x + w * 0.75, y + h * 0.25);
        ctx.lineTo(x + w * 0.68, y + h * 0.32);
      }
      ctx.stroke();
    }
  });

  ctx.textAlign = "left";
  ctx.font = "11px Arial";
  ctx.strokeStyle = "#c69b5e";
  ctx.fillStyle = "#7a5a2d";
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 5]);
  for (const strip of plate.strips) {
    if (plate.cutAxis === "transversal") {
      const cutX = ox + (strip.y + strip.height) * scale;
      if (cutX < ox + plateW - 1) {
        ctx.beginPath();
        ctx.moveTo(cutX, oy);
        ctx.lineTo(cutX, oy + plateH);
        ctx.stroke();
        ctx.save();
        ctx.translate(cutX + 5, oy + plateH + 12);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText("CORTE TRANSVERSAL COMPLETO", 0, 0);
        ctx.restore();
      }
      for (const piece of strip.pieces) {
        const cutY = oy + (piece.y + piece.drawHeight) * scale;
        if (cutY < oy + plateH - 1) {
          ctx.strokeStyle = "#8b96a1";
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(ox + strip.y * scale, cutY);
          ctx.lineTo(ox + (strip.y + strip.height) * scale, cutY);
          ctx.stroke();
        }
      }
    } else {
      const cutY = oy + (strip.y + strip.height) * scale;
      if (cutY < oy + plateH - 1) {
        ctx.beginPath();
        ctx.moveTo(ox, cutY);
        ctx.lineTo(ox + plateW, cutY);
        ctx.stroke();
        ctx.fillText("CORTE LONGITUDINAL COMPLETO", ox + plateW + 12, cutY + 4);
      }
      for (const piece of strip.pieces) {
        const cutX = ox + (piece.x + piece.drawWidth) * scale;
        if (cutX < ox + plateW - 1) {
          ctx.strokeStyle = "#8b96a1";
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(cutX, oy + strip.y * scale);
          ctx.lineTo(cutX, oy + (strip.y + strip.height) * scale);
          ctx.stroke();
        }
      }
    }
  }
  ctx.setLineDash([]);

  const xMarks = [...new Set([0, material.plateLength, ...plate.pieces.flatMap((piece) => [piece.x, piece.x + piece.drawWidth])])].sort((a, b) => a - b);
  const yMarks = [...new Set([0, material.plateWidth, ...plate.pieces.flatMap((piece) => [piece.y, piece.y + piece.drawHeight])])].sort((a, b) => a - b);
  ctx.fillStyle = "#52606d";
  ctx.strokeStyle = "#52606d";
  ctx.font = "10px Arial";
  ctx.textAlign = "center";
  for (const value of xMarks) {
    const x = ox + value * scale;
    ctx.beginPath();
    ctx.moveTo(x, oy - 5);
    ctx.lineTo(x, oy - 16);
    ctx.stroke();
    ctx.fillText(`${Math.round(value)}`, x, oy - 22);
  }
  ctx.save();
  ctx.textAlign = "right";
  for (const value of yMarks) {
    const y = oy + value * scale;
    ctx.beginPath();
    ctx.moveTo(ox - 5, y);
    ctx.lineTo(ox - 16, y);
    ctx.stroke();
    ctx.fillText(`${Math.round(value)}`, ox - 22, y + 3);
  }
  ctx.restore();

  ctx.textAlign = "left";
  ctx.fillStyle = "#10243d";
  ctx.font = "700 14px Arial";
  ctx.fillText("LEYENDA TAPACANTOS", ox + plateW + 18, oy + 24);
  const usedEdges = [...new Set(plate.pieces.flatMap((piece) => Object.values(piece.edges ?? {})).filter(Boolean))];
  usedEdges.forEach((id, index) => {
    const edge = edgeBands.find((item) => item.id === id);
    if (!edge) return;
    const y = oy + 52 + index * 34;
    ctx.strokeStyle = edge.color;
    ctx.lineWidth = 5;
    ctx.setLineDash(lineDash(edge.style));
    ctx.beginPath();
    ctx.moveTo(ox + plateW + 20, y);
    ctx.lineTo(ox + plateW + 70, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#394957";
    ctx.font = "12px Arial";
    ctx.fillText(`${edge.group} · ${edge.name}`, ox + plateW + 80, y + 4);
  });

  ctx.fillStyle = "#6d7780";
  ctx.font = "12px Arial";
  ctx.fillText("Medidas parciales y acumulativas en milímetros.", 39, height - 28);
}

export function clp(value) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value || 0);
}
