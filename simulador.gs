// Constantes de configuración de la interfaz
const SHEET_NAME = "Simulador";
const MEM_START_ROW = 5;
const MEM_START_COL = 2; // Columna B (La memoria ocupará de la columna 2 a la 33)
const REG_START_ROW = 5;
const REG_START_COL = 36; // CAMBIADO a la Columna AJ para separar visualmente la CPU de la RAM

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

// ==========================================
// FASE 1: LOGICA DEL CICLO DE INSTRUCCIÓN
// ==========================================

// Funciones auxiliares para CPU
function getReg(regName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const registros = ["PC", "IR", "MAR", "MDR", "AX", "BX"];
  let index = registros.indexOf(regName);
  if (index !== -1) {
    let val = sheet.getRange(REG_START_ROW + index, REG_START_COL + 1).getValue();
    return parseInt(val.toString().replace("'", ""), 16) || 0;
  }
  return 0;
}

function setReg(regName, value) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const registros = ["PC", "IR", "MAR", "MDR", "AX", "BX"];
  let index = registros.indexOf(regName);
  if (index !== -1) {
    let hexVal = "'" + value.toString(16).toUpperCase().padStart(2, '0');
    sheet.getRange(REG_START_ROW + index, REG_START_COL + 1).setValue(hexVal);
  }
}

function getFlag(flagName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const flags = ["ZF", "CF", "SF"];
  let index = flags.indexOf(flagName);
  if (index !== -1) {
    let val = sheet.getRange(REG_START_ROW + 8 + index, REG_START_COL + 1).getValue();
    return parseInt(val.toString().replace("'", ""), 10) || 0;
  }
  return 0;
}

function setFlag(flagName, value) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const flags = ["ZF", "CF", "SF"];
  let index = flags.indexOf(flagName);
  if (index !== -1) {
    let strVal = "'" + (value ? 1 : 0);
    sheet.getRange(REG_START_ROW + 8 + index, REG_START_COL + 1).setValue(strVal);
  }
}

function logMicroOp(message) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  let logStartRow = 5;
  let logStartCol = 40; // Columna AN
  
  // Inicializar cabecera si no existe
  if (sheet.getRange(logStartRow - 2, logStartCol).getValue() === "") {
    sheet.getRange(logStartRow - 2, logStartCol).setValue("LOG DE MICRO-OPERACIONES").setFontWeight("bold");
    sheet.setColumnWidth(logStartCol, 300);
  }
  
  // Buscar primera fila vacía
  let row = logStartRow;
  while (sheet.getRange(row, logStartCol).getValue() !== "") {
    row++;
  }
  
  // Formatear mensaje
  let step = (row - logStartRow + 1).toString().padStart(2, '0');
  sheet.getRange(row, logStartCol).setValue(`[Paso ${step}] ${message}`);
}

function Fetch() {
  logMicroOp("FETCH: Iniciando ciclo de búsqueda");
  
  // 1. PC -> MAR
  let pc = getReg("PC");
  setReg("MAR", pc);
  logMicroOp(`FETCH: PC -> MAR (MAR = ${pc.toString(16).toUpperCase().padStart(2, '0')}h)`);
  
  // 2. Read RAM a MDR
  let dataHex = Read(pc);
  let dataVal = parseInt(dataHex.toString().replace("'", ""), 16) || 0;
  setReg("MDR", dataVal);
  logMicroOp(`FETCH: RAM[MAR] -> MDR (MDR = ${dataHex})`);
  
  // 3. MDR -> IR
  setReg("IR", dataVal);
  logMicroOp(`FETCH: MDR -> IR (IR = ${dataHex})`);
  
  // 4. Incrementar PC
  setReg("PC", (pc + 1) % 256);
  logMicroOp(`FETCH: PC + 1 -> PC (PC = ${((pc + 1) % 256).toString(16).toUpperCase().padStart(2, '0')}h)`);
}

let estadoInstruccion = {
  opcode: 0,
  operando: 0,
  tipo: "", 
  regDestino: "",
  regOrigen: "",
  aluResult: 0,
  memAddress: 0,
  jump: false
};

function Decode() {
  logMicroOp("DECODE: Interpretando IR");
  let ir = getReg("IR");
  
  let highNibble = Math.floor(ir / 16);
  let lowNibble = ir % 16;
  
  estadoInstruccion.opcode = ir;
  estadoInstruccion.jump = false;
  estadoInstruccion.tipo = "1byte";
  
  if (ir === 0xFF) {
    estadoInstruccion.tipo = "HLT";
    logMicroOp("DECODE: Instrucción HLT (Parada)");
    return;
  }
  
  if ((highNibble >= 1 && highNibble <= 3) || highNibble === 0xA || highNibble === 0xB || highNibble === 0xC || (highNibble >= 5 && highNibble <= 6 && (lowNibble === 0 || lowNibble === 1)) || (highNibble === 9 && (lowNibble === 0 || lowNibble === 1))) {
    estadoInstruccion.tipo = "2bytes";
    let pc = getReg("PC");
    setReg("MAR", pc);
    let immHex = Read(pc);
    let immVal = parseInt(immHex.toString().replace("'", ""), 16) || 0;
    setReg("MDR", immVal);
    estadoInstruccion.operando = immVal;
    
    setReg("PC", (pc + 1) % 256);
    logMicroOp(`DECODE: Operando leído = ${immHex}, PC incrementado`);
  } else {
    logMicroOp(`DECODE: Instrucción de 1 byte identificada`);
  }
}

function Execute() {
  logMicroOp("EXECUTE: Ejecutando operación");
  if (estadoInstruccion.tipo === "HLT") return;

  let highNibble = Math.floor(estadoInstruccion.opcode / 16);
  let lowNibble = estadoInstruccion.opcode % 16;
  let regNames = ["AX", "BX"];
  
  estadoInstruccion.regDestino = "";
  
  switch(highNibble) {
    case 1: // LOAD reg, [dir]
      estadoInstruccion.regDestino = regNames[lowNibble];
      setReg("MAR", estadoInstruccion.operando);
      let dataRead = parseInt(Read(estadoInstruccion.operando).toString().replace("'", ""), 16) || 0;
      setReg("MDR", dataRead);
      estadoInstruccion.aluResult = dataRead;
      logMicroOp(`EXECUTE: Leyendo RAM[${estadoInstruccion.operando.toString(16).toUpperCase()}h] -> MDR = ${dataRead.toString(16).toUpperCase()}h`);
      break;
    case 2: // STORE [dir], reg
      estadoInstruccion.regOrigen = regNames[lowNibble];
      estadoInstruccion.memAddress = estadoInstruccion.operando;
      estadoInstruccion.aluResult = getReg(estadoInstruccion.regOrigen);
      setReg("MDR", estadoInstruccion.aluResult);
      logMicroOp(`EXECUTE: Preparando ${estadoInstruccion.regOrigen} para guardar en RAM`);
      break;
    case 3: // MOV reg, imm
      estadoInstruccion.regDestino = regNames[lowNibble];
      estadoInstruccion.aluResult = estadoInstruccion.operando;
      logMicroOp(`EXECUTE: Moviendo inmediato ${estadoInstruccion.operando.toString(16).toUpperCase()}h a ${estadoInstruccion.regDestino}`);
      break;
    case 4: // MOV reg, reg
      estadoInstruccion.regDestino = lowNibble === 0 ? "AX" : "BX";
      estadoInstruccion.regOrigen = lowNibble === 0 ? "BX" : "AX";
      estadoInstruccion.aluResult = getReg(estadoInstruccion.regOrigen);
      logMicroOp(`EXECUTE: Copiando de ${estadoInstruccion.regOrigen} a ${estadoInstruccion.regDestino}`);
      break;
    case 5: // ADD
    case 6: // SUB
    case 9: // CMP
      let op1Reg = (lowNibble === 0 || lowNibble === 2) ? "AX" : "BX";
      let op1 = getReg(op1Reg);
      let op2 = (lowNibble === 0 || lowNibble === 1) ? estadoInstruccion.operando : getReg(lowNibble === 2 ? "BX" : "AX");
      
      let res = 0;
      if (highNibble === 5) res = op1 + op2;
      else res = op1 - op2; 
      
      let finalRes = res & 0xFF;
      
      if (highNibble === 9) {
        setFlag("ZF", finalRes === 0); // FIX: actualizacion de bandera Zero tras instruccion CMP
        setFlag("CF", res > 255 || res < 0);
        setFlag("SF", (finalRes & 0x80) !== 0);
        estadoInstruccion.regDestino = "";
      } else {
        setFlag("ZF", finalRes === 0);
        setFlag("CF", res > 255 || res < 0);
        setFlag("SF", (finalRes & 0x80) !== 0);
        estadoInstruccion.regDestino = op1Reg;
      }
      
      estadoInstruccion.aluResult = finalRes;
      let opName = highNibble === 5 ? "ADD" : (highNibble === 6 ? "SUB" : "CMP");
      logMicroOp(`EXECUTE: ALU ${opName} -> Res: ${finalRes.toString(16).toUpperCase()}h`);
      break;
    case 7: // INC
    case 8: // DEC
      let incReg = regNames[lowNibble];
      let val = getReg(incReg);
      let incRes = highNibble === 7 ? val + 1 : val - 1;
      let fIncRes = incRes & 0xFF;
      
      setFlag("ZF", fIncRes === 0);
      setFlag("SF", (fIncRes & 0x80) !== 0);
      estadoInstruccion.aluResult = fIncRes;
      estadoInstruccion.regDestino = incReg;
      logMicroOp(`EXECUTE: ALU ${highNibble === 7 ? "INC" : "DEC"} ${incReg} -> ${fIncRes.toString(16).toUpperCase()}h`);
      break;
    case 0xA: // JMP
      estadoInstruccion.jump = true;
      estadoInstruccion.aluResult = estadoInstruccion.operando;
      logMicroOp("EXECUTE: Evaluando JMP -> Salto incondicional");
      break;
    case 0xB: // JZ
      if (getFlag("ZF") === 1) {
        estadoInstruccion.jump = true;
        estadoInstruccion.aluResult = estadoInstruccion.operando;
        logMicroOp("EXECUTE: Evaluando JZ -> ZF=1, Saltará");
      } else {
        logMicroOp("EXECUTE: Evaluando JZ -> ZF=0, No saltará");
      }
      break;
    case 0xC: // JNZ
      if (getFlag("ZF") === 0) {
        estadoInstruccion.jump = true;
        estadoInstruccion.aluResult = estadoInstruccion.operando;
        logMicroOp("EXECUTE: Evaluando JNZ -> ZF=0, Saltará");
      } else {
        logMicroOp("EXECUTE: Evaluando JNZ -> ZF=1, No saltará");
      }
      break;
  }
}

function Store() {
  logMicroOp("STORE: Escribiendo resultados");
  if (estadoInstruccion.tipo === "HLT") return;
  
  let highNibble = Math.floor(estadoInstruccion.opcode / 16);
  
  if (estadoInstruccion.jump) {
    setReg("PC", estadoInstruccion.aluResult);
    logMicroOp(`STORE: PC modificado a ${estadoInstruccion.aluResult.toString(16).toUpperCase()}h`);
  } else if (highNibble === 2) { // STORE
    setReg("MAR", estadoInstruccion.memAddress);
    Write(estadoInstruccion.memAddress, estadoInstruccion.aluResult.toString(16));
    logMicroOp(`STORE: RAM[${estadoInstruccion.memAddress.toString(16).toUpperCase()}h] <- ${estadoInstruccion.aluResult.toString(16).toUpperCase()}h`);
  } else if (estadoInstruccion.regDestino !== "") {
    setReg(estadoInstruccion.regDestino, estadoInstruccion.aluResult);
    logMicroOp(`STORE: Registro ${estadoInstruccion.regDestino} <- ${estadoInstruccion.aluResult.toString(16).toUpperCase()}h`);
  } else {
    logMicroOp("STORE: Ningún registro o memoria modificada");
  }
}

// ==========================================
// FASE 3 Y 4: CONTROLES, UI Y PROGRAMA DE PRUEBA
// ==========================================

let faseActual = 0; // 0: Fetch, 1: Decode, 2: Execute, 3: Store

function pasoAPaso() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  
  if (estadoInstruccion.tipo === "HLT") {
    SpreadsheetApp.getUi().alert("Ejecución finalizada (HLT)");
    return;
  }
  
  switch(faseActual) {
    case 0:
      Fetch();
      resaltarCelda("MAR");
      break;
    case 1:
      Decode();
      resaltarCelda("IR");
      break;
    case 2:
      Execute();
      resaltarCelda("ALU"); // Resalta AX/BX
      break;
    case 3:
      Store();
      resaltarCelda("MDR");
      break;
  }
  
  faseActual = (faseActual + 1) % 4;
}

function ejecucionContinua() {
  const ui = SpreadsheetApp.getUi();
  let delay = 500; // ms
  
  estadoInstruccion.tipo = "";
  
  while (estadoInstruccion.tipo !== "HLT") {
    Fetch();
    Decode();
    Execute();
    Store();
    
    SpreadsheetApp.flush(); // Fuerza la actualización visual de la hoja
    Utilities.sleep(delay);
  }
  
  ui.alert("Ejecución Continua Finalizada");
}

function cargarProgramaPrueba() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  
  // Limpiar RAM primero
  for (let i = 0; i < 256; i++) {
    Write(i, "00");
  }
  
  // Sucesión de Fibonacci
  let programa = [
    {dir: 0x00, val: "10"}, {dir: 0x01, val: "F0"}, // LOAD AX, [F0]
    {dir: 0x02, val: "11"}, {dir: 0x03, val: "F1"}, // LOAD BX, [F1]
    {dir: 0x04, val: "52"},                         // ADD AX, BX
    {dir: 0x05, val: "21"}, {dir: 0x06, val: "F0"}, // STORE [F0], BX
    {dir: 0x07, val: "20"}, {dir: 0x08, val: "F1"}, // STORE [F1], AX
    {dir: 0x09, val: "11"}, {dir: 0x0A, val: "FF"}, // LOAD BX, [FF]
    {dir: 0x0B, val: "81"},                         // DEC BX
    {dir: 0x0C, val: "21"}, {dir: 0x0D, val: "FF"}, // STORE [FF], BX
    {dir: 0x0E, val: "B0"}, {dir: 0x0F, val: "13"}, // JZ 13
    {dir: 0x10, val: "A0"}, {dir: 0x11, val: "00"}, // JMP 00
    {dir: 0x13, val: "FF"},                         // HLT
    
    // Variables iniciales
    {dir: 0xF0, val: "00"}, // A = 0
    {dir: 0xF1, val: "01"}, // B = 1
    {dir: 0xFF, val: "0A"}  // Contador = 10
  ];
  
  programa.forEach(inst => Write(inst.dir, inst.val));
  
  // Resetear CPU
  const registros = ["PC", "IR", "MAR", "MDR", "AX", "BX"];
  registros.forEach(reg => setReg(reg, 0));
  setFlag("ZF", 0); setFlag("CF", 0); setFlag("SF", 0);
  faseActual = 0;
  estadoInstruccion.tipo = "";
  
  SpreadsheetApp.getUi().alert("Programa de Fibonacci cargado exitosamente.");
  logMicroOp("PROGRAMA CARGADO: Fibonacci en 00h");
}

function resaltarCelda(componente) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  
  // Restaurar colores de RAM y Registros
  sheet.getRange(MEM_START_ROW, MEM_START_COL + 1, 16, 32).setBackground("#f3f3f3");
  sheet.getRange(REG_START_ROW, REG_START_COL + 1, 6, 1).setBackground("#ffffff");
  
  let rowIndex = 0;
  switch (componente) {
    case "MAR":
      rowIndex = REG_START_ROW + 2; // Índice MAR
      sheet.getRange(rowIndex, REG_START_COL + 1).setBackground("#ffff99"); // Amarillo
      break;
    case "IR":
      rowIndex = REG_START_ROW + 1;
      sheet.getRange(rowIndex, REG_START_COL + 1).setBackground("#99ccff"); // Azul claro
      break;
    case "ALU":
      // Resaltar AX y BX
      sheet.getRange(REG_START_ROW + 4, REG_START_COL + 1, 2, 1).setBackground("#ff9999"); // Rojo claro
      break;
    case "MDR":
      rowIndex = REG_START_ROW + 3;
      sheet.getRange(rowIndex, REG_START_COL + 1).setBackground("#99ff99"); // Verde claro
      break;
  }
}
