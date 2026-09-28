// Constantes de configuración de la interfaz
const SHEET_NAME = "Simulador";
const MEM_START_ROW = 5;
const MEM_START_COL = 2; // Columna B (La memoria ocupará de la columna 2 a la 33)
const REG_START_ROW = 5;
const REG_START_COL = 20; // Posicion inicial para la UI (con error visual)

/**
 * Tarea 1 y 2: Inicialización de la Memoria RAM y Registros
 */
function inicializarSimulador() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  } else {
    sheet.clear(); // Limpiar para el reset
  }

  // 1. Dibujar Memoria RAM (Matriz 16x16 = 256 posiciones de 00h a FFh)
  sheet.getRange(MEM_START_ROW - 2, MEM_START_COL).setValue("MEMORIA RAM (Segmentos de Código y Datos)").setFontWeight("bold");
  
  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 16; col++) {
      let address = (row * 16) + col;
      let hexAddress = address.toString(16).toUpperCase().padStart(2, '0') + 'h';
      
      let cellRow = MEM_START_ROW + row;
      let cellCol = MEM_START_COL + (col * 2); // Dejamos espacio para la dirección y el valor
      
      // Escribir dirección
      sheet.getRange(cellRow, cellCol).setValue(hexAddress).setFontColor("#888888");
      // Escribir valor inicial ('00 para forzar formato texto en Google Sheets)
      sheet.getRange(cellRow, cellCol + 1).setValue("'00").setHorizontalAlignment("center").setBackground("#f3f3f3");
    }
  }

  // 2. Dibujar Panel de Registros de la CPU
  sheet.getRange(REG_START_ROW - 2, REG_START_COL).setValue("REGISTROS CPU").setFontWeight("bold");
  const registros = ["PC", "IR", "MAR", "MDR", "AX", "BX"];
  
  registros.forEach((reg, index) => {
    sheet.getRange(REG_START_ROW + index, REG_START_COL).setValue(reg + ":").setFontWeight("bold");
    sheet.getRange(REG_START_ROW + index, REG_START_COL + 1).setValue("'00").setHorizontalAlignment("center");
  });

  // 3. Dibujar Banderas (Flags) de 1 bit
  sheet.getRange(REG_START_ROW + registros.length + 1, REG_START_COL).setValue("BANDERAS (Flags):").setFontWeight("bold");
  const flags = ["ZF (Zero)", "CF (Carry)", "SF (Sign)"];
  
  flags.forEach((flag, index) => {
    sheet.getRange(REG_START_ROW + registros.length + 2 + index, REG_START_COL).setValue(flag);
    sheet.getRange(REG_START_ROW + registros.length + 2 + index, REG_START_COL + 1).setValue("'0").setHorizontalAlignment("center");
  });

  // Ajustar anchos de columna para mejor visualización
  sheet.setColumnWidths(MEM_START_COL, 32, 40);
}

/**
 * Operación Primitiva: Leer de memoria RAM
 * @param {number} address Dirección en formato decimal (0-255)
 * @returns {string} Valor almacenado en formato hexadecimal
 */
function Read(address) {
  if (address < 0 || address > 255) return "Error: Out of bounds";
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  let row = Math.floor(address / 16);
  let col = address % 16;
  return sheet.getRange(MEM_START_ROW + row, MEM_START_COL + (col * 2) + 1).getValue();
}

/**
 * Operación Primitiva: Escribir en memoria RAM
 * @param {number} address Dirección en formato decimal (0-255)
 * @param {string} value Valor hexadecimal a guardar (ej. "A5")
 */
function Write(address, value) {
  if (address < 0 || address > 255) return;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  let row = Math.floor(address / 16);
  let col = address % 16;
  
  // Guardar valor asegurando formato de 2 caracteres en mayúsculas y forzando texto
  let hexValue = "'" + value.toString().toUpperCase().padStart(2, '0');
  sheet.getRange(MEM_START_ROW + row, MEM_START_COL + (col * 2) + 1).setValue(hexValue);
}
