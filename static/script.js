const $ = (id) => document.getElementById(id);

const BUSINESS_KEY = "billcraft_business_v1";

const businessFields = {
    name: "businessName",
    email: "businessEmail",
    phone: "businessPhone",
    address: "businessAddress",
    website: "businessWebsite",
    tax_id: "businessTaxId"
};

const invoiceFields = [
    "invoiceNumber",
    "invoiceDate",
    "dueDate",
    "status",
    "currency",
    "customerName",
    "customerEmail",
    "customerPhone",
    "customerAddress",
    "invoiceDiscount",
    "shipping",
    "taxRate",
    "paid",
    "paymentMethod",
    "paymentReference",
    "notes",
    "terms"
];

function getNumber(value) {
    const number = Number(value);

    if (!Number.isFinite(number) || number < 0) {
        return 0;
    }

    return number;
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[character]));
}

function getCurrencySymbol() {
    const currency = $("currency").value;

    if (currency.includes("$")) return "$";
    if (currency.includes("€")) return "€";
    if (currency.includes("£")) return "£";
    if (currency.includes("₹")) return "₹";

    return "৳";
}

function formatMoney(value) {
    return getCurrencySymbol() + Number(value || 0).toLocaleString(
        "en-US",
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    );
}

/* BUSINESS INFORMATION AND LOCAL STORAGE */

function getBusinessInfo() {
    const business = {};

    Object.entries(businessFields).forEach(([key, id]) => {
        business[key] = $(id).value.trim();
    });

    return business;
}

function loadBusinessInfo() {
    try {
        const saved = localStorage.getItem(BUSINESS_KEY);

        if (saved) {
            const business = JSON.parse(saved);

            Object.entries(businessFields).forEach(([key, id]) => {
                $(id).value = business[key] || "";
            });

            $("businessMessage").textContent =
                "Saved business information loaded.";
        }
    } catch (error) {
        $("businessMessage").textContent =
            "Saved information could not be loaded.";
    }

    updatePreview();
}

function saveBusinessInfo() {
    const button = $("saveBusinessBtn");
    const message = $("businessMessage");

    try {
        localStorage.setItem(
            BUSINESS_KEY,
            JSON.stringify(getBusinessInfo())
        );

        message.textContent =
            "Business information saved successfully.";

        button.textContent = "Saved!";

        updatePreview();
    } catch (error) {
        message.textContent =
            "Could not save. Check your browser storage settings.";

        button.textContent = "Save business info";
        return;
    }

    setTimeout(() => {
        button.textContent = "Save business info";
    }, 1500);
}

/* PRODUCT ROWS */

function addItemRow(item = {}) {
    const row = document.createElement("tr");

    row.innerHTML = `
        <td>
            <input class="description"
                   aria-label="Item description"
                   placeholder="Product or service"
                   value="${escapeHtml(item.description || "")}">
        </td>

        <td>
            <input class="quantity"
                   aria-label="Quantity"
                   type="number"
                   min="0"
                   step="any"
                   placeholder="1"
                   value="${escapeHtml(item.quantity ?? "")}">
        </td>

        <td>
            <input class="price"
                   aria-label="Unit price"
                   type="number"
                   min="0"
                   step="any"
                   placeholder="0.00"
                   value="${escapeHtml(item.price ?? "")}">
        </td>

        <td>
            <input class="discount"
                   aria-label="Item discount"
                   type="number"
                   min="0"
                   step="any"
                   placeholder="0.00"
                   value="${escapeHtml(item.discount ?? "")}">
        </td>

        <td>
            <button type="button"
                    class="remove-item"
                    aria-label="Remove item">×</button>
        </td>
    `;

    $("itemsBody").appendChild(row);

    row.querySelectorAll("input").forEach(input => {
        input.addEventListener("input", updatePreview);
    });

    row.querySelector(".remove-item").addEventListener("click", () => {
        row.remove();
        updatePreview();
    });

    updatePreview();
}

function getItems() {
    const items = [];

    document.querySelectorAll("#itemsBody tr").forEach(row => {
        const description = row.querySelector(".description").value.trim();
        const quantityRaw = row.querySelector(".quantity").value.trim();
        const priceRaw = row.querySelector(".price").value.trim();
        const discountRaw = row.querySelector(".discount").value.trim();

        // Ignore a row if all its fields are empty.
        if (
            !description &&
            !quantityRaw &&
            !priceRaw &&
            !discountRaw
        ) {
            return;
        }

        const quantity = getNumber(quantityRaw);
        const price = getNumber(priceRaw);
        const requestedDiscount = getNumber(discountRaw);

        const subtotal = quantity * price;
        const discount = Math.min(requestedDiscount, subtotal);
        const amount = Math.max(0, subtotal - discount);

        items.push({
            description: description || "Item",
            quantity,
            price,
            discount,
            amount
        });
    });

    return items;
}

/* TOTAL CALCULATIONS */

function calculateTotals() {
    const items = getItems();

    const subtotal = items.reduce(
        (sum, item) => sum + item.amount,
        0
    );

    const invoiceDiscount = Math.min(
        getNumber($("invoiceDiscount").value),
        subtotal
    );

    const shipping = getNumber($("shipping").value);

    const taxRate = Math.min(
        100,
        getNumber($("taxRate").value)
    );

    const taxableAmount = Math.max(
        0,
        subtotal - invoiceDiscount + shipping
    );

    const tax = taxableAmount * taxRate / 100;

    const total = taxableAmount + tax;

    const paid = Math.min(
        getNumber($("paid").value),
        total
    );

    const balance = Math.max(0, total - paid);

    return {
        items,
        subtotal,
        invoiceDiscount,
        shipping,
        taxRate,
        tax,
        total,
        paid,
        balance
    };
}

/* LIVE PREVIEW */

function setText(id, value) {
    $(id).textContent = value;
}

function showRow(id, visible) {
    $(id).classList.toggle("hidden", !visible);
}

function updatePreview() {
    const totals = calculateTotals();

    const business = getBusinessInfo();

    const businessDetails = [
        business.address,
        business.email,
        business.phone,
        business.website
    ].filter(Boolean);

    setText(
        "previewBusiness",
        business.name || "Your Business"
    );

    setText(
        "previewBusinessDetails",
        businessDetails.join(" · ") || "Business details not provided"
    );

    setText(
        "previewNumber",
        "Invoice # " + ($("invoiceNumber").value.trim() || "—")
    );

    setText(
        "previewDate",
        "Date " + ($("invoiceDate").value || "—")
    );

    const customerName = $("customerName").value.trim();

    setText(
        "previewCustomer",
        customerName || "Customer not specified"
    );

    const customerDetails = [
        $("customerAddress").value.trim(),
        $("customerEmail").value.trim(),
        $("customerPhone").value.trim()
    ].filter(Boolean);

    setText(
        "previewCustomerDetails",
        customerDetails.join(" · ")
    );

    const previewItems = $("previewItems");

    previewItems.innerHTML = "";

    if (totals.items.length === 0) {
        previewItems.innerHTML = `
            <tr>
                <td colspan="3">No items added</td>
            </tr>
        `;
    } else {
        totals.items.forEach(item => {
            const row = document.createElement("tr");

            row.innerHTML = `
                <td>${escapeHtml(item.description)}</td>
                <td>${item.quantity || "—"}</td>
                <td>${formatMoney(item.amount)}</td>
            `;

            previewItems.appendChild(row);
        });
    }

    setText("previewSubtotal", formatMoney(totals.subtotal));

    setText(
        "previewDiscount",
        "-" + formatMoney(totals.invoiceDiscount)
    );

    setText("previewShipping", formatMoney(totals.shipping));
    setText("previewTax", formatMoney(totals.tax));
    setText("previewTotal", formatMoney(totals.total));
    setText("previewPaid", formatMoney(totals.paid));
    setText("previewBalance", formatMoney(totals.balance));

    setText("summaryTotal", formatMoney(totals.total));
    setText("summaryBalance", formatMoney(totals.balance));

    showRow("discountRow", totals.invoiceDiscount > 0);
    showRow("shippingRow", totals.shipping > 0);
    showRow("taxRow", totals.taxRate > 0);

    showRow("paidRow", $("paid").value.trim() !== "");
    showRow("balanceRow", $("paid").value.trim() !== "");
}

/* COLLECT INVOICE INFORMATION */

function collectInvoice() {
    return {
        business: getBusinessInfo(),

        customer: {
            name: $("customerName").value.trim(),
            email: $("customerEmail").value.trim(),
            phone: $("customerPhone").value.trim(),
            address: $("customerAddress").value.trim()
        },

        invoice_number: $("invoiceNumber").value.trim(),
        invoice_date: $("invoiceDate").value,
        due_date: $("dueDate").value,
        status: $("status").value,
        currency: $("currency").value,

        items: getItems(),

        invoice_discount: $("invoiceDiscount").value,
        shipping: $("shipping").value,
        tax_rate: $("taxRate").value,
        paid: $("paid").value,

        payment_method: $("paymentMethod").value.trim(),
        payment_reference: $("paymentReference").value.trim(),

        notes: $("notes").value.trim(),
        terms: $("terms").value.trim()
    };
}

/* DOWNLOAD PDF */

async function downloadPDF() {
    const button = $("downloadBtn");
    const error = $("errorMessage");

    error.textContent = "";

    button.disabled = true;
    button.textContent = "Generating PDF...";

    try {
        const response = await fetch("/generate-pdf", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(collectInvoice())
        });

        if (!response.ok) {
            throw new Error(
                "PDF generation failed. Please check that Flask is running."
            );
        }

        const blob = await response.blob();

        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");

        const invoiceNumber = $("invoiceNumber").value.trim();

        const filename = invoiceNumber
            .replace(/[^a-z0-9_-]/gi, "") || "invoice";

        link.href = url;
        link.download = filename + ".pdf";

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(url), 1000);

    } catch (errorObject) {
        error.textContent =
            errorObject.message || "Unable to download the PDF.";
    } finally {
        button.disabled = false;
        button.textContent = "↓ Download PDF";
    }
}

/* RESET INVOICE WITHOUT DELETING BUSINESS INFORMATION */

function resetInvoice() {
    invoiceFields.forEach(id => {
        const field = $(id);

        if (id === "invoiceDate") {
            field.value = new Date().toISOString().slice(0, 10);
        } else if (id === "currency") {
            field.value = "BDT (৳)";
        } else {
            field.value = "";
        }
    });

    $("itemsBody").innerHTML = "";

    addItemRow();

    $("errorMessage").textContent = "";

    updatePreview();
}

/* EVENT LISTENERS */

$("saveBusinessBtn").addEventListener(
    "click",
    saveBusinessInfo
);

$("addItemBtn").addEventListener("click", () => {
    addItemRow();
});

$("downloadBtn").addEventListener("click", downloadPDF);

$("resetBtn").addEventListener("click", resetInvoice);

$("clearBtn").addEventListener("click", resetInvoice);

[...invoiceFields, ...Object.values(businessFields)].forEach(id => {
    $(id).addEventListener("input", updatePreview);
    $(id).addEventListener("change", updatePreview);
});

// Load previously saved business information.
loadBusinessInfo();

// Start with one empty product row.
addItemRow();

updatePreview();