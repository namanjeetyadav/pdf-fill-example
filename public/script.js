document.addEventListener('DOMContentLoaded', () => {
    console.log('Script loaded and DOMContentLoaded fired.'); // NEW: Log script start

    // --- DOM Elements ---
    const pdfUploadInput = document.getElementById('pdfUpload');
    const loadPdfBtn = document.getElementById('loadPdfBtn');
    const pdfCanvas = document.getElementById('pdfCanvas');
    const drawingOverlay = document.getElementById('drawingOverlay');
    const pdfMessage = document.getElementById('pdfMessage');
    const statusMessageDiv = document.getElementById('statusMessage');
    const fieldList = document.getElementById('fieldList');
    const generatePdfBtn = document.getElementById('generatePdfBtn');
    const pageNavigation = document.getElementById('pageNavigation');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const pageInfoSpan = document.getElementById('pageInfo');

    // Modal elements
    const fieldModal = document.getElementById('fieldModal');
    const fieldNameInput = document.getElementById('fieldNameInput');
    const fieldDefaultValueInput = document.getElementById('fieldDefaultValueInput');
    const fieldMultilineCheckbox = document.getElementById('fieldMultilineCheckbox');
    const saveFieldBtn = document.getElementById('saveFieldBtn');
    const cancelFieldBtn = document.getElementById('cancelFieldBtn');

    const ctx = pdfCanvas.getContext('2d');

    // --- State Variables ---
    let pdfDoc = null; // PDFDocumentProxy from PDF.js
    let currentPageNum = 1;
    let currentPage = null; // PDFPageProxy for the current page
    let currentPdfScale = 1; // Scale factor for rendering PDF to canvas
    let uploadedPdfFile = null; // The actual File object uploaded by the user

    let isDrawing = false;
    let startX, startY; // Mouse coordinates where drawing started
    let currentRect = null; // The div element representing the drawn rectangle

    // Array to store all defined fields
    const definedFields = []; // Stores { pageIndex, fieldName, x, y, width, height, multiline, defaultValue }

    // --- PDF Rendering Functions ---

    /**
     * Renders a specific page of the PDF onto the canvas.
     * @param {number} pageNum - The page number to render (1-based).
     */
    async function renderPage(pageNum) {
        if (!pdfDoc) return;

        currentPageNum = pageNum;
        pageInfoSpan.textContent = `Page ${currentPageNum} of ${pdfDoc.numPages}`;

        try {
            currentPage = await pdfDoc.getPage(pageNum);

            // Calculate scale to fit the PDF width to the canvas container
            const viewport = currentPage.getViewport({ scale: 1 });
            const containerWidth = pdfCanvas.parentElement.clientWidth;
            currentPdfScale = containerWidth / viewport.width;

            const scaledViewport = currentPage.getViewport({ scale: currentPdfScale });

            pdfCanvas.height = scaledViewport.height;
            pdfCanvas.width = scaledViewport.width;

            // Render PDF page into canvas context
            const renderContext = {
                canvasContext: ctx,
                viewport: scaledViewport,
            };
            await currentPage.render(renderContext).promise;

            // Clear and redraw existing field overlays for the current page
            clearDrawingOverlay();
            redrawFieldOverlays();
            pdfMessage.classList.add('hidden'); // Hide message once PDF is loaded
            drawingOverlay.classList.remove('hidden'); // Show drawing overlay
            pageNavigation.classList.remove('hidden'); // Show page navigation
            generatePdfBtn.classList.remove('hidden'); // Show generate button
            updatePageNavigationButtons();

        } catch (error) {
            console.error('Error rendering PDF page:', error);
            statusMessageDiv.textContent = 'Error rendering PDF page.';
            statusMessageDiv.style.backgroundColor = '#ffdddd';
        }
    }

    /**
     * Loads the selected PDF file and renders the first page.
     */
    async function loadPdf() {
        if (!uploadedPdfFile) {
            alert('Please select a PDF file first.');
            return;
        }

        statusMessageDiv.textContent = 'Loading PDF...';
        statusMessageDiv.style.backgroundColor = '#d1e7dd';
        pdfMessage.textContent = 'Loading PDF...';
        pdfMessage.classList.remove('hidden');
        drawingOverlay.classList.add('hidden');
        pageNavigation.classList.add('hidden');
        generatePdfBtn.classList.add('hidden');
        clearDrawingOverlay();
        definedFields.length = 0; // Clear previously defined fields
        updateFieldListUI();


        const fileReader = new FileReader();
        fileReader.onload = async () => {
            try {
                const typedArray = new Uint8Array(fileReader.result);
                pdfDoc = await pdfjsLib.getDocument({ data: typedArray }).promise;
                currentPageNum = 1;
                await renderPage(currentPageNum);
                statusMessageDiv.textContent = 'PDF loaded successfully. Draw fields on the PDF.';
                statusMessageDiv.style.backgroundColor = '#d4edda';
            } catch (error) {
                console.error('Error loading PDF:', error);
                statusMessageDiv.textContent = 'Error loading PDF. Make sure it is a valid PDF file.';
                statusMessageDiv.style.backgroundColor = '#ffdddd';
                pdfMessage.textContent = 'Failed to load PDF.';
                pdfDoc = null; // Reset pdfDoc on error
            }
        };
        fileReader.readAsArrayBuffer(uploadedPdfFile);
    }

    // --- Drawing Functionality ---

    /**
     * Converts mouse coordinates (relative to canvas) to PDF coordinates (bottom-left origin).
     * @param {number} clientX - Mouse X coordinate relative to viewport.
     * @param {number} clientY - Mouse Y coordinate relative to viewport.
     * @returns {{x: number, y: number}} PDF coordinates.
     */
    function convertClientToPdfCoordinates(clientX, clientY) {
        const rect = pdfCanvas.getBoundingClientRect();
        const canvasX = clientX - rect.left;
        const canvasY = clientY - rect.top;

        // Scale from canvas pixels to PDF units
        const pdfX = canvasX / currentPdfScale;
        const pdfY = (pdfCanvas.height - canvasY) / currentPdfScale; // PDF Y is from bottom

        return { x: pdfX, y: pdfY };
    }

    /**
     * Converts PDF coordinates to client (canvas) coordinates for drawing overlay.
     * @param {number} pdfX - PDF X coordinate.
     * @param {number} pdfY - PDF Y coordinate.
     * @returns {{x: number, y: number}} Client coordinates relative to canvas top-left.
     */
    function convertPdfToClientCoordinates(pdfX, pdfY) {
        const clientX = pdfX * currentPdfScale;
        const clientY = pdfCanvas.height - (pdfY * currentPdfScale); // Canvas Y is from top
        return { x: clientX, y: clientY };
    }

    /**
     * Clears all drawn field overlays from the drawing overlay.
     */
    function clearDrawingOverlay() {
        drawingOverlay.innerHTML = '';
    }

    /**
     * Redraws all defined field overlays for the current page.
     */
    function redrawFieldOverlays() {
        clearDrawingOverlay();
        definedFields.forEach(field => {
            if (field.pageIndex === (currentPageNum - 1)) { // Match current 0-based page index
                const clientStart = convertPdfToClientCoordinates(field.x, field.y + field.height); // Top-left of field
                const clientEnd = convertPdfToClientCoordinates(field.x + field.width, field.y); // Bottom-right of field

                const div = document.createElement('div');
                div.classList.add('drawn-field');
                div.style.left = `${clientStart.x}px`;
                div.style.top = `${clientStart.y}px`;
                div.style.width = `${clientEnd.x - clientStart.x}px`;
                div.style.height = `${clientEnd.y - clientStart.y}px`;
                drawingOverlay.appendChild(div);
            }
        });
    }

    // --- Mouse Event Handlers for Drawing ---

    drawingOverlay.addEventListener('mousedown', (e) => {
        // NEW: Only allow drawing if a PDF is loaded
        if (!pdfDoc) {
            statusMessageDiv.textContent = 'Please load a PDF first to draw fields.';
            statusMessageDiv.style.backgroundColor = '#ffdddd';
            return;
        }

        if (e.button === 0) { // Left mouse button
            isDrawing = true;
            startX = e.clientX;
            startY = e.clientY;
            console.log('Mousedown: isDrawing = true, startX:', startX, 'startY:', startY); // NEW: Log mousedown

            currentRect = document.createElement('div');
            currentRect.classList.add('drawn-field');
            currentRect.style.left = `${startX - drawingOverlay.getBoundingClientRect().left}px`;
            currentRect.style.top = `${startY - drawingOverlay.getBoundingClientRect().top}px`;
            drawingOverlay.appendChild(currentRect);
        }
    });

    drawingOverlay.addEventListener('mousemove', (e) => {
        if (!isDrawing) return;

        const currentX = e.clientX;
        const currentY = e.clientY;

        const overlayRect = drawingOverlay.getBoundingClientRect();
        const offsetX = overlayRect.left;
        const offsetY = overlayRect.top;

        const width = currentX - startX;
        const height = currentY - startY;

        currentRect.style.left = `${Math.min(startX, currentX) - offsetX}px`;
        currentRect.style.top = `${Math.min(startY, currentY) - offsetY}px`;
        currentRect.style.width = `${Math.abs(width)}px`;
        currentRect.style.height = `${Math.abs(height)}px`;
    });

    drawingOverlay.addEventListener('mouseup', (e) => {
        console.log('Mouseup detected. isDrawing:', isDrawing); // NEW: Log mouseup start
        if (!isDrawing) {
            console.log('Mouseup: Not drawing, returning.'); // NEW: Log if not drawing
            return; // Ensure we were actually drawing
        }
        isDrawing = false; // Reset drawing flag

        // NEW: Log dimensions to console for debugging
        console.log('Mouseup detected. currentRect dimensions:', currentRect ? `${currentRect.offsetWidth}x${currentRect.offsetHeight}` : 'null');

        // Check if the drawn rectangle is too small (e.g., just a click)
        // Increased threshold to 10px to be less sensitive to accidental clicks.
        const MIN_DRAW_SIZE = 10; // NEW: Define minimum draw size
        if (!currentRect || currentRect.offsetWidth < MIN_DRAW_SIZE || currentRect.offsetHeight < MIN_DRAW_SIZE) {
            console.log(`Drawing too small or invalid (${currentRect ? currentRect.offsetWidth : '0'}x${currentRect ? currentRect.offsetHeight : '0'}). Removing temporary rectangle.`); // NEW: Detailed log
            if (currentRect) currentRect.remove(); // Ensure it's removed
            currentRect = null; // Explicitly set to null
            return; // Stop processing this mouseup as a field definition
        }

        // Get the final drawn rectangle's position and size relative to the overlay
        const overlayRect = drawingOverlay.getBoundingClientRect();
        const rectLeft = parseFloat(currentRect.style.left) + overlayRect.left;
        const rectTop = parseFloat(currentRect.style.top) + overlayRect.top;
        const rectWidth = currentRect.offsetWidth;
        const rectHeight = currentRect.offsetHeight;

        // Convert these client coordinates to PDF coordinates
        const pdfStart = convertClientToPdfCoordinates(rectLeft, rectTop + rectHeight); // Bottom-left corner
        const pdfEnd = convertClientToPdfCoordinates(rectLeft + rectWidth, rectTop);   // Top-right corner

        const fieldX = Math.min(pdfStart.x, pdfEnd.x);
        const fieldY = Math.min(pdfStart.y, pdfEnd.y);
        const fieldWidth = Math.abs(pdfEnd.x - pdfStart.x);
        const fieldHeight = Math.abs(pdfEnd.y - pdfStart.y);

        // Store these temporary coordinates for the modal
        fieldModal.dataset.x = fieldX;
        fieldModal.dataset.y = fieldY;
        fieldModal.dataset.width = fieldWidth;
        fieldModal.dataset.height = fieldHeight;
        fieldModal.dataset.pageIndex = currentPageNum - 1; // 0-based page index

        // Show the modal to name the field
        console.log('Mouseup: Showing field modal.'); // NEW: Log before showing modal
        showFieldModal();

        // currentRect will be removed by hideFieldModal or after saving.
        // No need to set currentRect = null here immediately.
    });

    // Handle window resize to re-render PDF and overlays
    window.addEventListener('resize', async () => {
        if (pdfDoc && currentPage) {
            await renderPage(currentPageNum);
        }
    });

    // --- Field Modal Logic ---

    function showFieldModal() {
        console.log('showFieldModal called.'); // NEW: Log show modal
        fieldNameInput.value = ''; // Clear previous input
        fieldDefaultValueInput.value = '';
        fieldMultilineCheckbox.checked = false;
        fieldModal.classList.remove('hidden'); // Makes it visible

        // Temporarily hide the drawn rectangle when the modal is shown
        // This prevents it from intercepting clicks on the modal itself.
        if (currentRect) {
            currentRect.style.display = 'none';
            console.log('Temporary rectangle hidden.'); // NEW: Log hiding rect
        }
    }

    function hideFieldModal() {
        console.log('hideFieldModal called.'); // NEW: Log hide modal
        fieldModal.classList.add('hidden'); // Hides it
        if (currentRect) {
            currentRect.remove(); // Remove the temporary drawn rectangle if modal is cancelled or saved
            currentRect = null; // Ensure it's explicitly nullified
            console.log('Temporary rectangle removed and nullified.'); // NEW: Log rect removal
        }
    }

    saveFieldBtn.addEventListener('click', () => {
        console.log('Save Field button clicked.'); // NEW: Log button click
        const name = fieldNameInput.value.trim();
        if (!name) {
            alert('Please enter a field name.');
            return;
        }

        const fieldData = {
            pageIndex: parseInt(fieldModal.dataset.pageIndex),
            fieldName: name,
            x: parseFloat(fieldModal.dataset.x),
            y: parseFloat(fieldModal.dataset.y),
            width: parseFloat(fieldModal.dataset.width),
            height: parseFloat(fieldModal.dataset.height),
            multiline: fieldMultilineCheckbox.checked,
            defaultValue: fieldDefaultValueInput.value.trim()
        };

        definedFields.push(fieldData);
        updateFieldListUI();
        hideFieldModal(); // This will now also remove currentRect
        statusMessageDiv.textContent = `Field "${name}" added.`;
        statusMessageDiv.style.backgroundColor = '#d4edda';
    });

    cancelFieldBtn.addEventListener('click', () => { // NEW: Make it an anonymous function to log
        console.log('Cancel button clicked.'); // NEW: Log button click
        hideFieldModal(); // This will also remove currentRect
    });

    // --- Field List UI Management ---

    function updateFieldListUI() {
        fieldList.innerHTML = ''; // Clear existing list
        if (definedFields.length === 0) {
            fieldList.innerHTML = '<div class="no-fields-message">No fields defined yet. Draw on the PDF above!</div>';
            return;
        }

        definedFields.forEach((field, index) => {
            const fieldItem = document.createElement('div');
            fieldItem.classList.add('field-item');
            fieldItem.innerHTML = `
                <span><strong>${field.fieldName}</strong> (Page ${field.pageIndex + 1})</span>
                <span>X:${field.x.toFixed(2)}, Y:${field.y.toFixed(2)}, W:${field.width.toFixed(2)}, H:${field.height.toFixed(2)}</span>
                <button class="remove-field-btn" data-index="${index}">Remove</button>
            `;
            fieldList.appendChild(fieldItem);
        });
    }

    fieldList.addEventListener('click', (event) => {
        if (event.target.classList.contains('remove-field-btn')) {
            const indexToRemove = parseInt(event.target.dataset.index);
            if (!isNaN(indexToRemove)) {
                const removedFieldName = definedFields[indexToRemove].fieldName;
                definedFields.splice(indexToRemove, 1);
                updateFieldListUI();
                redrawFieldOverlays(); // Redraw overlays after removal
                statusMessageDiv.textContent = `Field "${removedFieldName}" removed.`;
                statusMessageDiv.style.backgroundColor = '#d4edda';
            }
        }
    });

    // --- Page Navigation Logic ---
    function updatePageNavigationButtons() {
        prevPageBtn.disabled = currentPageNum <= 1;
        nextPageBtn.disabled = currentPageNum >= pdfDoc.numPages;
    }

    prevPageBtn.addEventListener('click', async () => {
        if (currentPageNum > 1) {
            await renderPage(currentPageNum - 1);
        }
    });

    nextPageBtn.addEventListener('click', async () => {
        if (currentPageNum < pdfDoc.numPages) {
            await renderPage(currentPageNum + 1);
        }
    });

    // --- PDF Generation and Download ---

    generatePdfBtn.addEventListener('click', async () => {
        if (!uploadedPdfFile) {
            statusMessageDiv.textContent = 'Please upload a PDF file first.';
            statusMessageDiv.style.backgroundColor = '#ffdddd';
            return;
        }

        if (definedFields.length === 0) {
            statusMessageDiv.textContent = 'No fields defined. Draw fields on the PDF.';
            statusMessageDiv.style.backgroundColor = '#ffdddd';
            return;
        }

        statusMessageDiv.textContent = 'Generating PDF with fields...';
        statusMessageDiv.style.backgroundColor = '#d1e7dd';

        const formData = new FormData();
        formData.append('pdfFile', uploadedPdfFile);
        formData.append('fields', JSON.stringify(definedFields)); // Send the array of field definitions

        try {
            const response = await fetch('/add-fillable-fields', {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'pdf_with_new_fields.pdf';
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
                statusMessageDiv.textContent = 'PDF generated and downloaded successfully!';
                statusMessageDiv.style.backgroundColor = '#d4edda';
            } else {
                const errorText = await response.text();
                statusMessageDiv.textContent = `Error: ${errorText}`;
                statusMessageDiv.style.backgroundColor = '#ffdddd';
            }
        } catch (error) {
            console.error('Fetch error:', error);
            statusMessageDiv.textContent = `Network error: ${error.message}`;
            statusMessageDiv.style.backgroundColor = '#ffdddd';
        }
    });

    // --- Initial Setup ---
    pdfUploadInput.addEventListener('change', (event) => {
        uploadedPdfFile = event.target.files[0];
        if (uploadedPdfFile) {
            statusMessageDiv.textContent = `PDF selected: ${uploadedPdfFile.name}. Click "Load PDF".`;
            statusMessageDiv.style.backgroundColor = '#e9ecef';
        } else {
            statusMessageDiv.textContent = 'No PDF selected.';
            statusMessageDiv.style.backgroundColor = '#ffdddd';
        }
    });

    loadPdfBtn.addEventListener('click', loadPdf);

    // Initial message
    statusMessageDiv.textContent = 'Please upload a PDF file to begin.';
    statusMessageDiv.style.backgroundColor = '#e9ecef';
    updateFieldListUI(); // Initialize field list UI
});
