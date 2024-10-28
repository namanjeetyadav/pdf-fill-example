const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

// Function to fill the PDF form
async function fillPdf(inputPdfPath, outputPdfPath, data) {
    // Load the existing PDF document
    const existingPdfBytes = fs.readFileSync(inputPdfPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    
    // Get the form from the PDF
    const form = pdfDoc.getForm();
    
    // Fill in the form fields
    for (const [key, value] of Object.entries(data)) {
        const field = form.getField(key);
        if (field) {
            field.setText(value);
        } else {
            console.warn(`Field "${key}" not found in PDF form.`);
        }
    }

    // Serialize the PDFDocument to bytes (a Uint8Array)
    const pdfBytes = await pdfDoc.save();

    // Write the filled PDF to a file
    fs.writeFileSync(outputPdfPath, pdfBytes);
}

// List of people’s data
const peopleData = [
    { name: 'Hansraj' }, 
    { name: 'Naman' }, 
    { name: 'Raju' },   
    { name: 'Mohan' },   
    { name: 'himanshu' },    
    { name: 'rajesh' }   
   
];

// Fill the PDF for each person
async function run() {
    for (const person of peopleData) {
        await fillPdf('form_template.pdf', `filled_form_${person.name}.pdf`, person);
    }
}

run().catch(err => console.error(err));