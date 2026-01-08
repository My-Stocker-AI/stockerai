# Update Flatten Data Node - Reference New Extract PDF Path Node

The "Extract PDF Path" node has been added to extract the path from the Upload response.

Update the Flatten Data node to reference this new node instead of "Upload PDFto Storage".

## Change This Line

**OLD (around line 86):**
```javascript
pdfPath = $('Upload PDFto Storage').first().json.path || null;
```

**NEW:**
```javascript
pdfPath = $('Extract PDF Path').first().json.path || null;
```

That's it - just change the node name in that one line.
