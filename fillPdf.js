const fs = require('fs/promises');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const express = require('express');
const multer = require('multer');
const path = require('path');

// Initialize Express App
const app = express();
const port = 3000;

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Existing fillExistingPdfFields function (no changes needed here)
async function fillExistingPdfFields(inputPdfBuffer, data) {
    try {
        const pdfDoc = await PDFDocument.load(inputPdfBuffer);
        const form = pdfDoc.getForm();

        for (const [key, value] of Object.entries(data)) {
            try {
                const field = form.getTextField(key);
                if (field) {
                    field.setText(String(value));
                } else {
                    console.warn(`Field "${key}" not found or is not a text field in PDF form.`);
                }
            } catch (fieldError) {
                console.warn(`Error accessing/setting field "${key}": ${fieldError.message}`);
            }
        }
        const pdfBytes = await pdfDoc.save();
        return pdfBytes;
    } catch (error) {
        console.error('Error in fillExistingPdfFields function:', error);
        throw error;
    }
}

/**
 * NEW FUNCTION: Adds fillable text fields to a PDF based on provided definitions.
 * This function is designed to create brand new fillable text fields on the PDF.
 *
 * @param {Buffer} inputPdfBuffer - The content of the input PDF file as a Buffer.
 * @param {Array<Object>} fieldDefinitions - An array of objects, each defining a field:
 * { pageIndex: number, fieldName: string, x: number, y: number, width: number, height: number, multiline: boolean, defaultValue?: string }
 * @returns {Promise<Uint8Array>} A Promise that resolves with the bytes of the modified PDF.
 */
async function addFillableFieldsToPdf(inputPdfBuffer, fieldDefinitions) {
    try {
        const pdfDoc = await PDFDocument.load(inputPdfBuffer);
        const pages = pdfDoc.getPages();
        const form = pdfDoc.getForm(); // <--- GET THE FORM OBJECT HERE
        const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

        for (const field of fieldDefinitions) {
            const { pageIndex, fieldName, x, y, width, height, multiline, defaultValue } = field;

            if (pageIndex < 0 || pageIndex >= pages.length) {
                console.warn(`Skipping field "${fieldName}": Invalid page index ${pageIndex}. PDF has ${pages.length} pages.`);
                continue;
            }

            const page = pages[pageIndex];

            // --- CORRECTED USAGE ---
            // 1. Create the text field using form.createTextField()
            const textField = form.createTextField(fieldName);

            // 2. Set its default value if provided
            if (defaultValue) {
                textField.setText(String(defaultValue));
            }

            // 3. Add the created text field to the specified page with its properties
            textField.addToPage(page, {
                x: x,
                y: y,
                width: width,
                height: height,
                font: helveticaFont,
                textColor: rgb(0, 0, 0),
                borderColor: rgb(0.7, 0.7, 0.7),
                backgroundColor: rgb(0.95, 0.95, 0.95),
                borderWidth: 1,
                multiline: multiline,
            });
            // --- END CORRECTED USAGE ---
        }

        const pdfBytes = await pdfDoc.save();
        return pdfBytes;
    } catch (error) {
        console.error('Error in addFillableFieldsToPdf function:', error);
        throw error;
    }
}

// --- API Endpoint for Filling Existing PDF Forms ---
app.post('/fill-pdf', upload.single('pdfFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send('No PDF file uploaded.');
        }
        const pdfBuffer = req.file.buffer;
        const formData = JSON.parse(req.body.formData);

        if (!formData || typeof formData !== 'object' || Object.keys(formData).length === 0) {
            return res.status(400).send('Invalid or empty form data provided.');
        }

        const modifiedPdfBytes = await fillExistingPdfFields(pdfBuffer, formData);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="filled_form.pdf"');
        res.send(Buffer.from(modifiedPdfBytes));

    } catch (error) {
        console.error('Error in /fill-pdf endpoint:', error);
        res.status(500).send('Failed to process PDF: ' + error.message);
    }
});

// --- NEW API Endpoint for Adding Fillable Fields ---
app.post('/add-fillable-fields', upload.single('pdfFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send('No PDF file uploaded.');
        }

        const pdfBuffer = req.file.buffer;
        const fieldDefinitions = JSON.parse(req.body.fields);

        if (!fieldDefinitions || !Array.isArray(fieldDefinitions) || fieldDefinitions.length === 0) {
            return res.status(400).send('Invalid or empty field definitions provided.');
        }

        const modifiedPdfBytes = await addFillableFieldsToPdf(pdfBuffer, fieldDefinitions);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="pdf_with_new_fields.pdf"');
        res.send(Buffer.from(modifiedPdfBytes));

    } catch (error) {
        console.error('Error in /add-fillable-fields endpoint:', error);
        res.status(500).send('Failed to add fields to PDF: ' + error.message);
    }
});


// --- Start the Express Server ---
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
    console.log(`Open http://localhost:${port} in your browser to use the PDF form filler tool.`);
});