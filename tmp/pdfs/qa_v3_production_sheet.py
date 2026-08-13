from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "tmp" / "pdfs"
PNG = OUTPUT / "qa_v3_production_sheet.png"
PDF = OUTPUT / "qa_v3_production_sheet.pdf"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def font(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT, size)


image = Image.new("RGB", (1400, 900), "#f6f5f2")
draw = ImageDraw.Draw(image)
logo_path = ROOT / "public" / "logo-casa-diseno.png"
logo = Image.open(logo_path).convert("RGBA")
logo.thumbnail((190, 68))
image.paste(logo, (38, 24), logo)

navy = "#101820"
ink = "#303a44"
muted = "#59636d"
line = "#a9b0b7"
draw.text((260, 28), "PLANO DE CORTE", fill=navy, font=font(22, True))
draw.text(
    (260, 58),
    "PROYECTO: Cocina piloto V3 - CLIENTE: Cliente de prueba",
    fill=navy,
    font=font(13, True),
)
draw.text(
    (260, 82),
    "COTIZACIÓN: COT-QA3107 - ESTADO: Producción - RUT: 12.345.678-5",
    fill=ink,
    font=font(12),
)
draw.text(
    (260, 104),
    "MATERIAL: EGGER Gris Cachemira (62-EGGER-1504) - 2600 x 1830 x 15 mm",
    fill=ink,
    font=font(12),
)
draw.text(
    (260, 126),
    "PLACA 1 - PRIMER CORTE: LONGITUDINAL - RESPONSABLE: Operador QA",
    fill=ink,
    font=font(12),
)
draw.line((38, 153, 1362, 153), fill=line, width=1)

plate = (115, 188, 1015, 788)
draw.rectangle(plate, fill="white", outline=navy, width=3)
pieces = [
    (115, 188, 415, 388, "P-001 - Costado", "860 x 560"),
    (415, 188, 715, 388, "P-001 - Costado", "860 x 560"),
    (115, 388, 415, 588, "P-002 - Frente", "720 x 400"),
    (415, 388, 715, 588, "P-002 - Frente", "720 x 400"),
    (715, 388, 1015, 588, "P-003 - Base", "600 x 500"),
]
for index, (x1, y1, x2, y2, label, measure) in enumerate(pieces):
    draw.rectangle(
        (x1, y1, x2, y2),
        fill="#d8dde0" if index % 2 == 0 else "#e7eaec",
        outline=muted,
        width=1,
    )
    draw.text(((x1 + x2) / 2, (y1 + y2) / 2 - 16), label, fill=navy, font=font(13, True), anchor="mm")
    draw.text(((x1 + x2) / 2, (y1 + y2) / 2 + 12), measure, fill=ink, font=font(10, True), anchor="mm")
    draw.line((x1 + 7, y1 + 7, x2 - 7, y1 + 7), fill=navy, width=6)
    draw.line((x1 + 7, y2 - 8, x2 - 7, y2 - 8), fill=ink, width=2)
draw.rectangle((715, 188, 1015, 388), outline=muted, width=2)
draw.text((865, 288), "RET-QA-001\n900 x 560", fill=muted, font=font(12, True), anchor="mm", align="center")

right_x = 1043
draw.text((right_x, 185), "LEYENDA TAPACANTOS", fill=navy, font=font(14, True))
for index, (code, label, width) in enumerate(
    [
        ("T1", "PVC 1,5 mm - 67-D-0080", 6),
        ("T2", "PVC 0,4 mm - 62-CHH-1001", 3),
    ]
):
    y = 225 + index * 40
    draw.rectangle((right_x, y - 13, right_x + 28, y + 7), fill=navy)
    draw.text((right_x + 14, y - 3), code, fill="white", font=font(9, True), anchor="mm")
    draw.line((right_x + 40, y - 3, right_x + 94, y - 3), fill=navy, width=width)
    draw.text((right_x + 104, y - 10), label, fill=ink, font=font(9))

list_top = 315
draw.text((right_x, list_top), "PIEZAS Y RETAZOS DE ESTA PLACA", fill=navy, font=font(13, True))
draw.text((right_x, list_top + 22), "6 piezas - 1 retazo - 4 líneas", fill=muted, font=font(9))
draw.text(
    (right_x, list_top + 38),
    "Controles: C corte - E enchape - S supervisión/despacho",
    fill=muted,
    font=font(8),
)
table_right = 1368
header_y = list_top + 52
draw.rectangle((right_x, header_y, table_right, header_y + 24), fill="#e1e4e6")
draw.text((right_x + 5, header_y + 6), "CÓDIGO / ELEMENTO", fill=ink, font=font(8, True))
draw.text((1248, header_y + 6), "MEDIDA", fill=ink, font=font(8, True))
draw.text((1295, header_y + 6), "UD.", fill=ink, font=font(8, True))
for index, label in enumerate(["C", "E", "S"]):
    draw.text((1320 + index * 22, header_y + 6), label, fill=ink, font=font(8, True))

rows = [
    ("P-001 - Costado", "860x560", "2"),
    ("P-002 - Frente", "720x400", "2"),
    ("P-003 - Base", "600x500", "1"),
    ("RET-QA-001 - Retazo", "900x560", "1"),
]
for index, (label, measure, quantity) in enumerate(rows):
    y = header_y + 34 + index * 31
    if index % 2:
        draw.rectangle((right_x, y - 7, table_right, y + 20), fill="#ffffff")
    draw.text((right_x + 5, y), label, fill=ink, font=font(8, True))
    draw.text((1248, y), measure, fill=ink, font=font(8), anchor="ra")
    draw.text((1295, y), quantity, fill=ink, font=font(8), anchor="ra")
    for box_index in range(3):
        bx = 1315 + box_index * 22
        draw.rectangle((bx, y - 2, bx + 11, y + 9), outline=navy, width=2)

draw.text(
    (39, 860),
    "Medidas interiores: parciales - Exteriores: acumuladas - C/E/S: controles de producción - Unidades en mm.",
    fill=muted,
    font=font(10),
)
image.save(PNG)

page_width, page_height = landscape(A4)
pdf = canvas.Canvas(str(PDF), pagesize=(page_width, page_height))
scale = min((page_width - 28) / image.width, (page_height - 32) / image.height)
draw_width = image.width * scale
draw_height = image.height * scale
pdf.drawImage(
    ImageReader(image),
    (page_width - draw_width) / 2,
    (page_height - draw_height) / 2,
    width=draw_width,
    height=draw_height,
)
pdf.setFont("Helvetica", 6.5)
pdf.setFillColorRGB(0.32, 0.37, 0.41)
pdf.drawRightString(page_width - 14, 8, "Hoja 1 de 1 - Plano y listado inseparables")
pdf.save()

print(PDF)
