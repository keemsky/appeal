// Global constants for sheet and folder names
const SHEET_NAME = "เรื่องร้องเรียน";
const FOLDER_NAME = "ไฟล์เรื่องร้องเรียน";
const ADMIN_PASSWORD = "a123456";

/**
 * @description Serves the HTML file for the web app.
 * @param {object} e - The event parameter.
 * @returns {HtmlOutput} The HTML output for the web app.
 */
function doGet(e) {
  checkAndSetup(); // Ensure folder and sheet are ready before loading
  const htmlOutput = HtmlService.createTemplateFromFile('index').evaluate();
  htmlOutput
    .setTitle("ระบบแจ้งเรื่องร้องเรียน โรงเรียนบ้านทุ่งใคร")
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
  return htmlOutput;
}

/**
 * @description Includes external HTML files into the main template.
 * @param {string} filename - The name of the HTML file to include.
 * @returns {string} The content of the HTML file.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}


/**
 * @description Checks for the existence of the required folder and sheet.
 * If they don't exist, it creates them along with the necessary headers.
 */
function checkAndSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Check and create sheet
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    const headers = [
      "เลขที่อ้างอิง", "วันที่แจ้ง", "สถานะ", "ไม่ประสงค์ออกนาม",
      "ชื่อ-นามสกุล", "เบอร์โทรศัพท์", "อีเมล", "ต้องการให้ติดต่อกลับ",
      "ประเภทเรื่องร้องเรียน", "รายละเอียด", "ID หลักฐาน", "ลิงก์หลักฐาน"
    ];
    sheet.appendRow(headers);
    sheet.getRange("A1:L1").setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  // Check and create folder
  const folders = DriveApp.getFoldersByName(FOLDER_NAME);
  if (!folders.hasNext()) {
    DriveApp.createFolder(FOLDER_NAME);
  }
}

/**
 * @description Gets the web app's URL.
 * @returns {string} The URL of the deployed web app.
 */
function getWebAppUrl() {
  return ScriptApp.getService().getUrl();
}


/**
 * @description Submits the complaint form data to the Google Sheet and uploads the file to Drive.
 * @param {object} formObject - The form data from the client side.
 * @returns {object} A result object with status and a message or reference number.
 */
function submitComplaintForm(formObject) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    const folder = DriveApp.getFoldersByName(FOLDER_NAME).next();

    let fileId = '';
    let fileUrl = '';

    // Handle file upload if a file is present
    if (formObject.fileData) {
      const decodedData = Utilities.base64Decode(formObject.fileData.split(',')[1]);
      const blob = Utilities.newBlob(decodedData, formObject.fileType, formObject.fileName);
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      fileId = file.getId();
      fileUrl = file.getUrl();
    }
    
    const referenceId = `BJT-${new Date().getTime()}`;

    // Prepare data for the sheet row
    const rowData = [
      referenceId,
      new Date(formObject.complaintDate),
      "ยังไม่ดำเนินการ",
      formObject.isAnonymous ? "ใช่" : "ไม่ใช่",
      formObject.isAnonymous ? "-" : formObject.fullName,
      formObject.isAnonymous ? "-" : formObject.phone,
      formObject.isAnonymous ? "-" : formObject.email,
      formObject.isAnonymous ? "ไม่ระบุ" : formObject.contactBack,
      formObject.complaintType,
      formObject.details,
      fileId,
      fileUrl,
    ];

    sheet.appendRow(rowData);

    return { status: 'success', message: `แจ้งเรื่องสำเร็จ! เลขที่อ้างอิงของคุณคือ: ${referenceId}` };
  } catch (error) {
    Logger.log(error.toString());
    return { status: 'error', message: `เกิดข้อผิดพลาด: ${error.toString()}` };
  }
}

/**
 * @description Fetches all complaint data from the Google Sheet.
 * @returns {Array<object>} An array of complaint objects.
 */
function getComplaintData() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) return [];
    
    // Get all data except the header row
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    
    // Remove header row
    const headers = values.shift(); 
    
    // Map data to objects for easier handling
    const data = values.map((row, index) => {
      let obj = {};
      headers.forEach((header, i) => {
        // Format date correctly
        if (header === "วันที่แจ้ง" && row[i] instanceof Date) {
           obj[header] = Utilities.formatDate(new Date(row[i]), "GMT+7", "dd/MM/yyyy");
        } else {
           obj[header] = row[i];
        }
      });
      obj.rowNumber = index + 2; // +2 because sheet rows are 1-based and we shifted headers
      return obj;
    }).reverse(); // Show newest complaints first

    return data;

  } catch (error) {
    Logger.log(error.toString());
    return []; // Return empty array on error
  }
}


/**
 * @description Updates the status of a specific complaint.
 * @param {number} rowNumber - The row number of the complaint in the sheet.
 * @param {string} newStatus - The new status to set.
 * @returns {object} A result object.
 */
function updateStatus(rowNumber, newStatus) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    sheet.getRange(rowNumber, 3).setValue(newStatus); // Column C is 'สถานะ'
    return { status: 'success', message: 'อัปเดตสถานะเรียบร้อยแล้ว' };
  } catch (error) {
    Logger.log(error.toString());
    return { status: 'error', message: `เกิดข้อผิดพลาด: ${error.toString()}` };
  }
}

/**
 * @description Deletes a complaint record and its associated file from Drive.
 * @param {number} rowNumber - The row number to delete.
 * @param {string} fileId - The ID of the file in Google Drive to delete.
 * @returns {object} A result object.
 */
function deleteComplaint(rowNumber, fileId) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    
    // Delete file from Google Drive if it exists
    if (fileId) {
        try {
            const file = DriveApp.getFileById(fileId);
            file.setTrashed(true); // Move to trash instead of permanent delete
        } catch(e) {
            Logger.log(`Could not find or delete file with ID: ${fileId}. It might have been deleted already. Error: ${e.toString()}`);
        }
    }

    sheet.deleteRow(rowNumber);
    return { status: 'success', message: 'ลบข้อมูลเรียบร้อยแล้ว' };
  } catch (error) {
    Logger.log(error.toString());
    return { status: 'error', message: `เกิดข้อผิดพลาด: ${error.toString()}` };
  }
}

/**
 * @description Checks if the provided password matches the admin password.
 * @param {string} password - The password to check.
 * @returns {boolean} True if the password is correct, otherwise false.
 */
function checkPassword(password) {
    return password === ADMIN_PASSWORD;
}
