# Update Flatten Data Node - Add PDF URL Support

**IMPORTANT**: This update ONLY ADDS pdf_url to the route object. Do NOT replace the entire code - just add these sections.

## What to Add

You need to add TWO sections to your existing "Flatten Data" node code:

---

## Section 1: Add PDF URL Extraction (BEFORE the return statement)

**Location**: Add this code RIGHT BEFORE the final `return [{` statement (around line 82)

**Code to add**:
```javascript
// Get PDF URL from Upload PDF to Storage node (if it exists)
var pdfPath = null;
var pdfUrl = null;

try {
  pdfPath = $('Upload PDF to Storage').first().json.path || null;
  if (pdfPath) {
    pdfUrl = 'https://wvtkuposrlvadyeixlke.supabase.co/storage/v1/object/public/route-pdfs/' + pdfPath;
  }
} catch (e) {
  // Upload PDF to Storage node doesn't exist yet - that's ok
  console.log('[INFO] No PDF storage node found - pdf_url will be null');
}

```

---

## Section 2: Add pdf_url to Route Object

**Location**: Find the `route:` object in the return statement (around line 99-105)

**Current code**:
```javascript
route: {
  user_id: userId,
  route_name: data.route_name,
  delivery_date: date,
  total_machines: machines.length,
  total_items: items.length
},
```

**Updated code** (add ONE line):
```javascript
route: {
  user_id: userId,
  route_name: data.route_name,
  delivery_date: date,
  total_machines: machines.length,
  total_items: items.length,
  pdf_url: pdfUrl  // NEW: Add PDF URL
},
```

---

## Summary

You're making TWO small changes:
1. ✅ Add PDF URL extraction code (8 lines) before the return statement
2. ✅ Add `pdf_url: pdfUrl` to the route object (1 line)

**Total changes**: 9 lines added, 0 lines removed

---

## After the Update

Once you've added the Upload PDF to Storage node AND updated Flatten Data:
1. Save the workflow
2. Upload a test PDF
3. Check the routes table in Supabase
4. The `pdf_url` column should now have a clickable URL like:
   `https://wvtkuposrlvadyeixlke.supabase.co/storage/v1/object/public/route-pdfs/2024-01-15/user123_143052.pdf`
5. Click the URL to verify the PDF opens
