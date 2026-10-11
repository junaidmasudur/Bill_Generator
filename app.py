from flask import Flask, render_template, request, send_file, jsonify
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
)
from io import BytesIO
from datetime import date
import html
import math

app = Flask(__name__)


def text_value(value):
    if value is None:
        return ""
    return str(value).strip()


def number_value(value):
    try:
        number = float(value)
        if not math.isfinite(number):
            return 0
        return max(0, number)
    except (TypeError, ValueError):
        return 0


def money(value, currency):
    symbols = {
        "BDT (৳)": "BDT ",
        "USD ($)": "$",
        "EUR (€)": "EUR ",
        "GBP (£)": "GBP ",
        "INR (₹)": "INR "
    }

    symbol = symbols.get(currency, "BDT ")
    return f"{symbol}{value:,.2f}"


def safe_paragraph(value):
    return html.escape(text_value(value)).replace("\n", "<br/>")


@app.route("/")
def index():
    return render_template(
        "index.html",
        today=date.today().isoformat()
    )


@app.route("/generate-pdf", methods=["POST"])
def generate_pdf():
    data = request.get_json(silent=True) or {}

    business = data.get("business", {})
    customer = data.get("customer", {})
    items_data = data.get("items", [])

    if not isinstance(business, dict):
        business = {}

    if not isinstance(customer, dict):
        customer = {}

    if not isinstance(items_data, list):
        items_data = []

    currency = text_value(data.get("currency")) or "BDT (৳)"

    invoice_number = text_value(data.get("invoice_number"))
    invoice_date = text_value(data.get("invoice_date"))
    due_date = text_value(data.get("due_date"))
    status = text_value(data.get("status"))

    notes = text_value(data.get("notes"))
    terms = text_value(data.get("terms"))
    payment_method = text_value(data.get("payment_method"))
    payment_reference = text_value(data.get("payment_reference"))

    subtotal = 0
    items = []

    for item in items_data:
        if not isinstance(item, dict):
            continue

        description = text_value(item.get("description"))
        quantity_raw = text_value(item.get("quantity"))
        price_raw = text_value(item.get("price"))
        discount_raw = text_value(item.get("discount"))

        if not any([
            description, quantity_raw, price_raw, discount_raw
        ]):
            continue

        quantity = number_value(quantity_raw)
        price = number_value(price_raw)
        discount = number_value(discount_raw)

        gross = quantity * price
        discount = min(discount, gross)
        amount = max(0, gross - discount)

        subtotal += amount

        items.append({
            "description": description or "Item",
            "quantity": quantity,
            "price": price,
            "discount": discount,
            "amount": amount
        })

    invoice_discount = min(
        number_value(data.get("invoice_discount")),
        subtotal
    )

    shipping = number_value(data.get("shipping"))
    tax_rate = min(100, number_value(data.get("tax_rate")))

    taxable_amount = max(
        0, subtotal - invoice_discount + shipping
    )

    tax_amount = taxable_amount * tax_rate / 100

    total = taxable_amount + tax_amount

    paid = min(number_value(data.get("paid")), total)
    balance = max(0, total - paid)

    buffer = BytesIO()

    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=17 * mm,
        leftMargin=17 * mm,
        topMargin=17 * mm,
        bottomMargin=17 * mm,
        title=invoice_number or "Invoice"
    )

    styles = getSampleStyleSheet()

    styles.add(ParagraphStyle(
        name="BusinessTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=21,
        leading=26,
        textColor=colors.HexColor("#17243a"),
        alignment=0,
        spaceAfter=5
    ))

    styles.add(ParagraphStyle(
        name="SmallText",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#526176"),
        spaceAfter=3
    ))

    styles.add(ParagraphStyle(
        name="SectionTitle",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=10,
        textColor=colors.HexColor("#315de8"),
        spaceBefore=12,
        spaceAfter=6
    ))

    styles.add(ParagraphStyle(
        name="TableHeader",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=8,
        textColor=colors.white
    ))

    styles.add(ParagraphStyle(
        name="RightText",
        parent=styles["SmallText"],
        alignment=2
    ))

    story = []

    business_name = text_value(business.get("name"))

    story.append(Paragraph(
        safe_paragraph(business_name or "Business"),
        styles["BusinessTitle"]
    ))

    for label, key in [
        ("Email", "email"),
        ("Phone", "phone"),
        ("Address", "address"),
        ("Website", "website"),
        ("Tax ID", "tax_id")
    ]:
        value = text_value(business.get(key))

        if value:
            story.append(Paragraph(
                f"<b>{label}:</b> {safe_paragraph(value)}",
                styles["SmallText"]
            ))

    story.append(Spacer(1, 8 * mm))

    invoice_title = Paragraph("INVOICE", styles["BusinessTitle"])

    metadata = []

    for label, value in [
        ("Invoice number", invoice_number),
        ("Invoice date", invoice_date),
        ("Due date", due_date),
        ("Status", status)
    ]:
        if value:
            metadata.append([
                Paragraph(f"<b>{label}</b>", styles["SmallText"]),
                Paragraph(safe_paragraph(value), styles["RightText"])
            ])

    if not metadata:
        metadata = [["", ""]]

    metadata_table = Table(
        metadata,
        colWidths=[30 * mm, 48 * mm],
        hAlign="RIGHT"
    )

    metadata_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3)
    ]))

    header = Table(
        [[invoice_title, metadata_table]],
        colWidths=[document.width * 0.53, document.width * 0.47]
    )

    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0)
    ]))

    story.append(header)

    customer_lines = []

    for label, key in [
        ("Customer", "name"),
        ("Email", "email"),
        ("Phone", "phone"),
        ("Address", "address")
    ]:
        value = text_value(customer.get(key))

        if value:
            customer_lines.append(Paragraph(
                f"<b>{label}:</b> {safe_paragraph(value)}",
                styles["SmallText"]
            ))

    if customer_lines:
        story.append(Paragraph(
            "BILL TO", styles["SectionTitle"]
        ))
        story.extend(customer_lines)

    story.append(Spacer(1, 5 * mm))

    table_data = [[
        Paragraph("DESCRIPTION", styles["TableHeader"]),
        Paragraph("QTY", styles["TableHeader"]),
        Paragraph("UNIT PRICE", styles["TableHeader"]),
        Paragraph("DISCOUNT", styles["TableHeader"]),
        Paragraph("AMOUNT", styles["TableHeader"])
    ]]

    for item in items:
        table_data.append([
            Paragraph(
                safe_paragraph(item["description"]),
                styles["SmallText"]
            ),
            Paragraph(
                f'{item["quantity"]:g}',
                styles["RightText"]
            ),
            Paragraph(
                money(item["price"], currency),
                styles["RightText"]
            ),
            Paragraph(
                money(item["discount"], currency),
                styles["RightText"]
            ),
            Paragraph(
                money(item["amount"], currency),
                styles["RightText"]
            )
        ])

    if not items:
        table_data.append([
            Paragraph("No item details provided", styles["SmallText"]),
            "", "", "",
            Paragraph(money(0, currency), styles["RightText"])
        ])

    widths = [
        document.width * 0.38,
        document.width * 0.09,
        document.width * 0.18,
        document.width * 0.16,
        document.width * 0.19
    ]

    item_table = Table(
        table_data,
        colWidths=widths,
        repeatRows=1
    )

    item_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0),
         colors.HexColor("#24334d")),
        ("GRID", (0, 0), (-1, -1), 0.4,
         colors.HexColor("#e1e6ee")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1),
         [colors.white, colors.HexColor("#f7f9fc")]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7)
    ]))

    story.append(item_table)
    story.append(Spacer(1, 6 * mm))

    totals = [
        ["Subtotal", money(subtotal, currency)]
    ]

    if invoice_discount:
        totals.append([
            "Invoice discount",
            "-" + money(invoice_discount, currency)
        ])

    if shipping:
        totals.append(["Shipping", money(shipping, currency)])

    if tax_rate:
        totals.append([
            f"Tax ({tax_rate:g}%)",
            money(tax_amount, currency)
        ])

    totals.append(["TOTAL", money(total, currency)])

    if text_value(data.get("paid")):
        totals.append(["Paid", money(paid, currency)])
        totals.append(["Balance due", money(balance, currency)])

    totals_table = Table(
        totals,
        colWidths=[43 * mm, 43 * mm],
        hAlign="RIGHT"
    )

    totals_table.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("LINEABOVE", (0, -1), (-1, -1), 0.8,
         colors.HexColor("#24334d")),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5)
    ]))

    story.append(totals_table)

    for title, value in [
        ("PAYMENT DETAILS", payment_method),
        ("PAYMENT REFERENCE", payment_reference),
        ("NOTES", notes),
        ("TERMS & CONDITIONS", terms)
    ]:
        if value:
            story.append(Paragraph(
                title, styles["SectionTitle"]
            ))
            story.append(Paragraph(
                safe_paragraph(value), styles["SmallText"]
            ))

    story.append(Spacer(1, 10 * mm))
    story.append(Paragraph(
        "Thank you for your business.",
        ParagraphStyle(
            "Thanks",
            parent=styles["SmallText"],
            alignment=1
        )
    ))

    document.build(story)
    buffer.seek(0)

    filename = "".join(
        char for char in invoice_number
        if char.isalnum() or char in "-_"
    ) or "invoice"

    return send_file(
        buffer,
        mimetype="application/pdf",
        as_attachment=True,
        download_name=f"{filename}.pdf"
    )


if __name__ == "__main__":
    app.run(debug=True)