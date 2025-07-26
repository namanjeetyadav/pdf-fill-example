const fs = require('fs/promises'); // Use fs.promises for async file operations
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib'); // Ensure StandardFonts and rgb are imported
const express = require('express');   // For creating the web server
const multer = require('multer');     // For handling file uploads
const path = require('path');         // For working with file paths

// Initialize Express App
const app = express();
const port = 3000; // The port your server will listen on

// Configure Multer to store the uploaded file in memory as a Buffer
// This is important because pdf-lib needs the PDF content as bytes/buffer.
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Serve static files from the 'public' directory
// When a user visits http://localhost:3000, Express will look for index.html here.
app.use(express.static(path.join(__dirname, 'public')));

// Enable Express to parse JSON bodies from incoming requests
// This is used to receive the form field data from your frontend.
app.use(express.json());

/**
 * Function to fill existing PDF form fields.
 * This function is designed to fill data into fields that are already present in the PDF.
 * It is distinct from adding new fillable fields.
 *
 * @param {Buffer} inputPdfBuffer - The content of the input PDF file as a Buffer.
 * @param {Object} data - An object where keys are PDF form field names and values are the text to fill.
 * @returns {Promise<Uint8Array>} A Promise that resolves with the bytes of the modified PDF.
 */
async function fillExistingPdfFields(inputPdfBuffer, data) {
    try {
        // Load the existing PDF document from the provided buffer
        const pdfDoc = await PDFDocument.load(inputPdfBuffer);

        // Get the form from the PDF
        const form = pdfDoc.getForm();

        // Fill in the form fields
        for (const [key, value] of Object.entries(data)) {
            try {
                // Attempt to get the text field by its name.
                // Using getTextField is more specific than getField if you know it's a text field.
                const field = form.getTextField(key);
                if (field) {
                    // Set the text of the field. Ensure the value is converted to a string.
                    field.setText(String(value));
                } else {
                    // Log a warning if the field is not found, but don't stop the process.
                    console.warn(`Field "${key}" not found or is not a text field in PDF form.`);
                }
            } catch (fieldError) {
                // Catch errors specific to accessing or setting a field (e.g., if it's not a text field type).
                console.warn(`Error accessing/setting field "${key}": ${fieldError.message}`);
            }
        }

        // Serialize the PDFDocument to bytes (a Uint8Array)
        // This is the modified PDF content ready to be sent back.
        const pdfBytes = await pdfDoc.save();

        // Return the modified PDF bytes
        return pdfBytes;
    } catch (error) {
        // Log and re-throw any critical errors that occur during PDF processing.
        console.error('Error in fillExistingPdfFields function:', error);
        throw error; // This error will be caught by the API endpoint's try-catch block.
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
        // Ensure StandardFonts and rgb are directly accessible here
        const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

        for (const field of fieldDefinitions) {
            const { pageIndex, fieldName, x, y, width, height, multiline, defaultValue } = field;

            // Validate page index
            if (pageIndex < 0 || pageIndex >= pages.length) {
                console.warn(`Skipping field "${fieldName}": Invalid page index ${pageIndex}. PDF has ${pages.length} pages.`);
                continue; // Skip to the next field if page index is out of bounds
            }

            const page = pages[pageIndex];

            // Add the text field to the specified page with given properties
            const textField = page.addTextField(fieldName, {
                x: x,
                y: y,
                width: width,
                height: height,
                font: helveticaFont,
                textColor: rgb(0, 0, 0), // Black text color
                borderColor: rgb(0.7, 0.7, 0.7), // Light gray border
                backgroundColor: rgb(0.95, 0.95, 0.95), // Light gray background
                borderWidth: 1, // Border thickness
                multiline: multiline, // Allow multiple lines of text
            });

            // Set a default value if provided
            if (defaultValue) {
                textField.setText(String(defaultValue));
            }
        }

        // Serialize the PDFDocument to bytes
        const pdfBytes = await pdfDoc.save();
        return pdfBytes;
    } catch (error) {
        console.error('Error in addFillableFieldsToPdf function:', error);
        throw error;
    }
}

// --- API Endpoint for Filling Existing PDF Forms (retained for clarity) ---
// This endpoint will receive the PDF file and the form data for existing fields from your frontend.
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

        const modifiedPdfBytes = await fillExistingPdfFields(pdfBuffer, formData); // Call specific function

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="filled_form.pdf"');
        res.send(Buffer.from(modifiedPdfBytes));

    } catch (error) {
        console.error('Error in /fill-pdf endpoint:', error);
        res.status(500).send('Failed to process PDF: ' + error.message);
    }
});

// --- NEW API Endpoint for Adding Fillable Fields ---
// This endpoint will receive the PDF file and the array of new field definitions from your frontend.
app.post('/add-fillable-fields', upload.single('pdfFile'), async (req, res) => {
    try {
        // Check if a PDF file was uploaded by the client
        if (!req.file) {
            return res.status(400).send('No PDF file uploaded.');
        }

        const pdfBuffer = req.file.buffer;

        // The field definitions are sent as a JSON string in the 'fields' field
        const fieldDefinitions = JSON.parse(req.body.fields);

        // Basic validation for the field definitions
        if (!fieldDefinitions || !Array.isArray(fieldDefinitions) || fieldDefinitions.length === 0) {
            return res.status(400).send('Invalid or empty field definitions provided.');
        }

        // Call the new function to add fillable fields
        const modifiedPdfBytes = await addFillableFieldsToPdf(pdfBuffer, fieldDefinitions);

        // Set HTTP headers to instruct the browser to download the response as a PDF file
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="pdf_with_new_fields.pdf"');

        // Send the modified PDF bytes back to the client
        res.send(Buffer.from(modifiedPdfBytes));

    } catch (error) {
        console.error('Error in /add-fillable-fields endpoint:', error);
        res.status(500).send('Failed to add fields to PDF: ' + error.message);
    }
});


// --- Start the Express Server ---
// The server will listen for incoming HTTP requests on the specified port.
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
    console.log(`Open http://localhost:${port} in your browser to use the PDF form filler tool.`);
});
