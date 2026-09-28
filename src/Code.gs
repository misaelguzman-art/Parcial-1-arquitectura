const SHEET_SIM = 'Simulator';
const SHEET_TRACE = 'Trace';
const CODE_LIMIT = 0x7f;
const DATA_START = 0x80;

const OPCODES = {
  MOV: 0x10,
  LOAD: 0x11,
  STORE: 0x12,
  ADD: 0x20,
  SUB: 0x21,
  INC: 0x22,
  DEC: 0x23,
  CMP: 0x24,
  JMP: 0x30,
  JZ: 0x31,
  JNZ: 0x32,
  HLT: 0xff,
};

const SAMPLE_PROGRAM = [
  'MOV AX, #05h',
  'MOV BX, #03h',
  'ADD AX, BX',
  'STORE AX, [80h]',
  'CMP AX, #08h',
  'JZ 07h',
  'MOV AX, #00h',
  'HLT',
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('CPU Simulator')
    .addItem('Inicializar', 'initializeSimulator')
    .addItem('Cargar Programa', 'loadProgram')
    .addItem('Paso a Paso', 'stepMode')
    .addItem('Continuo', 'runContinuous')
    .addItem('Pausa', 'pauseExecution')
    .addItem('Reset', 'resetSimulator')
    .addToUi();
}

function initializeSimulator() {
  const ss = SpreadsheetApp.getActive();
  const sim = ensureSheet_(ss, SHEET_SIM);
  const trace = ensureSheet_(ss, SHEET_TRACE);

  sim.clear();
  trace.clear();

  sim.getRange('A1:E1').setValues([['Address', 'Hex', 'Binary', 'Decimal/Mnemonic', 'Segment']]);
  for (let i = 0; i < 256; i++) {
    const row = i + 2;
    const hex = toHex_(i);
    sim.getRange(row, 1, 1, 5).setValues([[`${hex}h`, '00h', '00000000', '0', i <= CODE_LIMIT ? 'CODE' : 'DATA']]);
    sim.getRange(row, 5).setBackground(i <= CODE_LIMIT ? '#e3f2fd' : '#e8f5e9');
  }

  sim.getRange('G1:H1').setValues([['Registro', 'Valor']]);
  const registers = ['PC', 'IR', 'MAR', 'MDR', 'AX', 'BX', 'ZF', 'CF', 'SF', 'ALU', 'PHASE'];
  sim.getRange(2, 7, registers.length, 1).setValues(registers.map((r) => [r]));
  sim.getRange(2, 8, registers.length, 1).setValues([
    ['00h'],
    ['NOP'],
    ['00h'],
    ['00h'],
    ['00h'],
    ['00h'],
    [0],
    [0],
    [0],
    ['Idle'],
    ['Idle'],
  ]);

  sim.getRange('J1:K3').setValues([
    ['Controles', 'Valor'],
    ['Delay (ms)', 500],
    ['Running', 'NO'],
  ]);

  trace.getRange('A1:D1').setValues([['Step', 'Phase', 'Micro-operación', 'Estado breve']]);

  setState_(defaultState_());
  appendTrace_('INIT', 'Simulator listo con RAM 256x8 y segmentos CODE/DATA.');
}

function loadProgram() {
  const sim = SpreadsheetApp.getActive().getSheetByName(SHEET_SIM);
  if (!sim) {
    initializeSimulator();
  }

  const state = defaultState_();
  state.program = SAMPLE_PROGRAM.map(parseInstruction_);
  state.program.forEach((inst, idx) => {
    const address = idx & 0xff;
    writeMemoryByte_(address, OPCODES[inst.op] || 0x00, inst.text);
  });

  writeMemoryByte_(0x80, 0x00);
  writeMemoryByte_(0x81, 0x00);

  setState_(state);
  paintRegisters_(state);
  appendTrace_('LOAD', 'Programa de prueba cargado en segmento CODE.');
}

function stepMode() {
  executeCycle_(false);
}

function runContinuous() {
  const sim = SpreadsheetApp.getActive().getSheetByName(SHEET_SIM);
  if (!sim) {
    initializeSimulator();
  }

  let state = getState_();
  state.running = true;
  setState_(state);
  sim.getRange('K3').setValue('SI');

  const delay = Number(sim.getRange('K2').getValue()) || 500;
  let guard = 0;

  while (guard < 512) {
    state = getState_();
    if (!state.running || state.halted) {
      break;
    }
    executeCycle_(true);
    Utilities.sleep(delay);
    guard += 1;
  }

  state = getState_();
  if (state.halted) {
    sim.getRange('K3').setValue('NO');
  }
}

function pauseExecution() {
  const sim = SpreadsheetApp.getActive().getSheetByName(SHEET_SIM);
  const state = getState_();
  state.running = false;
  setState_(state);
  if (sim) {
    sim.getRange('K3').setValue('NO');
  }
  appendTrace_('PAUSE', 'Ejecución continua pausada por usuario.');
}

function resetSimulator() {
  setState_(defaultState_());
  initializeSimulator();
}

function executeCycle_(fromContinuous) {
  const state = getState_();
  if (state.halted) {
    appendTrace_('HALT', 'CPU detenida. Usa Reset para reiniciar.');
    return;
  }

  state.step += 1;

  setPhase_('FETCH');
  state.mar = state.pc & 0xff;
  state.mdr = readMemoryByte_(state.mar);
  state.ir = getInstructionText_(state.mar, state.program) || `DB ${toHex_(state.mdr)}h`;
  appendTrace_('FETCH', `MAR <- ${toHex_(state.mar)}h, MDR <- MEM[${toHex_(state.mar)}h], IR <- ${state.ir}`);

  setPhase_('DECODE');
  const instruction = state.program[state.pc] || parseInstruction_('HLT');
  appendTrace_('DECODE', `Decodificando ${instruction.text}`);

  setPhase_('EXECUTE');
  executeInstruction_(state, instruction);

  setPhase_('STORE');
  state.pc = state.nextPc & 0xff;
  state.nextPc = (state.pc + 1) & 0xff;
  appendTrace_('STORE', `PC actualizado a ${toHex_(state.pc)}h`);

  if (!fromContinuous) {
    state.running = false;
  }

  if (state.halted) {
    state.running = false;
  }

  setState_(state);
  paintRegisters_(state);

  const sim = SpreadsheetApp.getActive().getSheetByName(SHEET_SIM);
  if (sim) {
    sim.getRange('K3').setValue(state.running ? 'SI' : 'NO');
  }
}

function executeInstruction_(state, instruction) {
  const arg1 = instruction.args[0];
  const arg2 = instruction.args[1];

  switch (instruction.op) {
    case 'MOV':
      writeRegisterOrMemory_(state, arg1, readOperand_(state, arg2));
      state.alu = `MOV ${arg1}`;
      appendTrace_('EXECUTE', `${arg1} <- ${formatByte_(readOperand_(state, arg2))}`);
      break;
    case 'LOAD':
      writeRegister_(state, arg1, readOperand_(state, arg2));
      state.alu = `LOAD ${arg1}`;
      appendTrace_('EXECUTE', `${arg1} <- MEM[${arg2}]`);
      break;
    case 'STORE': {
      const value = readOperand_(state, arg1);
      const address = parseAddress_(arg2);
      setMemoryByte_(address, value);
      state.alu = `STORE ${arg1}`;
      appendTrace_('EXECUTE', `MEM[${toHex_(address)}h] <- ${formatByte_(value)}`);
      break;
    }
    case 'ADD': {
      const result = readOperand_(state, arg1) + readOperand_(state, arg2);
      setFlags_(state, result);
      writeRegister_(state, arg1, result);
      state.alu = `${arg1} + ${arg2}`;
      appendTrace_('EXECUTE', `${arg1} <- ${arg1} + ${arg2}`);
      break;
    }
    case 'SUB': {
      const result = readOperand_(state, arg1) - readOperand_(state, arg2);
      setFlags_(state, result);
      writeRegister_(state, arg1, result);
      state.alu = `${arg1} - ${arg2}`;
      appendTrace_('EXECUTE', `${arg1} <- ${arg1} - ${arg2}`);
      break;
    }
    case 'INC': {
      const result = readOperand_(state, arg1) + 1;
      setFlags_(state, result);
      writeRegister_(state, arg1, result);
      state.alu = `INC ${arg1}`;
      appendTrace_('EXECUTE', `${arg1} <- ${arg1} + 1`);
      break;
    }
    case 'DEC': {
      const result = readOperand_(state, arg1) - 1;
      setFlags_(state, result);
      writeRegister_(state, arg1, result);
      state.alu = `DEC ${arg1}`;
      appendTrace_('EXECUTE', `${arg1} <- ${arg1} - 1`);
      break;
    }
    case 'CMP': {
      const result = readOperand_(state, arg1) - readOperand_(state, arg2);
      setFlags_(state, result);
      state.alu = `CMP ${arg1}, ${arg2}`;
      appendTrace_('EXECUTE', `Flags actualizadas por comparación ${arg1} vs ${arg2}`);
      break;
    }
    case 'JMP':
      state.nextPc = parseAddress_(arg1);
      state.alu = `JMP ${arg1}`;
      appendTrace_('EXECUTE', `Salto incondicional a ${toHex_(state.nextPc)}h`);
      break;
    case 'JZ':
      if (state.flags.zf === 1) {
        state.nextPc = parseAddress_(arg1);
        appendTrace_('EXECUTE', `ZF=1, salto a ${toHex_(state.nextPc)}h`);
      } else {
        appendTrace_('EXECUTE', 'ZF=0, no hay salto.');
      }
      state.alu = `JZ ${arg1}`;
      break;
    case 'JNZ':
      if (state.flags.zf === 0) {
        state.nextPc = parseAddress_(arg1);
        appendTrace_('EXECUTE', `ZF=0, salto a ${toHex_(state.nextPc)}h`);
      } else {
        appendTrace_('EXECUTE', 'ZF=1, no hay salto.');
      }
      state.alu = `JNZ ${arg1}`;
      break;
    case 'HLT':
      state.halted = true;
      state.alu = 'HALT';
      appendTrace_('EXECUTE', 'HLT detectado. CPU detenida.');
      break;
    default:
      state.halted = true;
      state.alu = 'ERROR';
      appendTrace_('EXECUTE', `Instrucción no soportada: ${instruction.op}`);
      break;
  }
}

function defaultState_() {
  return {
    pc: 0,
    nextPc: 1,
    ir: 'NOP',
    mar: 0,
    mdr: 0,
    ax: 0,
    bx: 0,
    flags: { zf: 0, cf: 0, sf: 0 },
    alu: 'Idle',
    halted: false,
    running: false,
    step: 0,
    program: [],
  };
}

function ensureSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function setState_(state) {
  PropertiesService.getDocumentProperties().setProperty('CPU_STATE', JSON.stringify(state));
}

function getState_() {
  const raw = PropertiesService.getDocumentProperties().getProperty('CPU_STATE');
  return raw ? JSON.parse(raw) : defaultState_();
}

function parseInstruction_(line) {
  const clean = line.trim();
  const [rawOp, ...rest] = clean.split(' ');
  const op = (rawOp || 'HLT').toUpperCase();
  const args = rest.join(' ').split(',').map((s) => s.trim()).filter(Boolean);
  return { op, args, text: clean };
}

function readOperand_(state, operand) {
  if (!operand) {
    return 0;
  }
  if (operand === 'AX') {
    return state.ax & 0xff;
  }
  if (operand === 'BX') {
    return state.bx & 0xff;
  }
  if (operand.startsWith('#')) {
    return parseAddress_(operand.slice(1));
  }
  if (operand.startsWith('[') && operand.endsWith(']')) {
    return readMemoryByte_(parseAddress_(operand));
  }
  return parseAddress_(operand);
}

function writeRegisterOrMemory_(state, operand, value) {
  if (operand.startsWith('[')) {
    setMemoryByte_(parseAddress_(operand), value);
    return;
  }
  writeRegister_(state, operand, value);
}

function writeRegister_(state, register, value) {
  const byte = value & 0xff;
  if (register === 'AX') {
    state.ax = byte;
  }
  if (register === 'BX') {
    state.bx = byte;
  }
}

function setFlags_(state, result) {
  const masked = result & 0xff;
  state.flags.zf = masked === 0 ? 1 : 0;
  state.flags.sf = (masked & 0x80) !== 0 ? 1 : 0;
  state.flags.cf = result > 0xff || result < 0 ? 1 : 0;
}

function parseAddress_(raw) {
  const clean = raw.replace('[', '').replace(']', '').replace('#', '').trim().toLowerCase();
  if (clean.endsWith('h')) {
    return parseInt(clean.slice(0, -1), 16) & 0xff;
  }
  if (clean.startsWith('0x')) {
    return parseInt(clean, 16) & 0xff;
  }
  return parseInt(clean || '0', 10) & 0xff;
}

function paintRegisters_(state) {
  const sim = SpreadsheetApp.getActive().getSheetByName(SHEET_SIM);
  if (!sim) {
    return;
  }
  sim.getRange('H2:H12').setValues([
    [formatByte_(state.pc)],
    [state.ir],
    [formatByte_(state.mar)],
    [formatByte_(state.mdr)],
    [formatByte_(state.ax)],
    [formatByte_(state.bx)],
    [state.flags.zf],
    [state.flags.cf],
    [state.flags.sf],
    [state.alu],
    [state.halted ? 'HALTED' : state.running ? 'RUN' : 'IDLE'],
  ]);
}

function setPhase_(phase) {
  const sim = SpreadsheetApp.getActive().getSheetByName(SHEET_SIM);
  if (!sim) {
    return;
  }
  const labels = ['FETCH', 'DECODE', 'EXECUTE', 'STORE'];
  sim.getRange('G2:G12').setBackground('#ffffff');
  sim.getRange('H12').setValue(phase);
  labels.forEach((label, idx) => {
    if (label === phase) {
      sim.getRange(2 + idx, 7).setBackground('#fff59d');
    }
  });
}

function appendTrace_(phase, operation) {
  const trace = SpreadsheetApp.getActive().getSheetByName(SHEET_TRACE);
  if (!trace) {
    return;
  }
  const state = getState_();
  trace.appendRow([state.step, phase, operation, `PC=${toHex_(state.pc)}h AX=${toHex_(state.ax)}h BX=${toHex_(state.bx)}h`]);
}

function writeMemoryByte_(address, value, mnemonic) {
  setMemoryByte_(address, value);
  const sim = SpreadsheetApp.getActive().getSheetByName(SHEET_SIM);
  if (!sim) {
    return;
  }
  const row = address + 2;
  if (mnemonic) {
    sim.getRange(row, 4).setValue(`${value} / ${mnemonic}`);
  }
}

function setMemoryByte_(address, value) {
  const sim = SpreadsheetApp.getActive().getSheetByName(SHEET_SIM);
  if (!sim) {
    return;
  }
  const byte = value & 0xff;
  const row = (address & 0xff) + 2;
  sim.getRange(row, 2, 1, 3).setValues([[`${toHex_(byte)}h`, toBin_(byte), byte]]);
}

function readMemoryByte_(address) {
  const sim = SpreadsheetApp.getActive().getSheetByName(SHEET_SIM);
  if (!sim) {
    return 0;
  }
  const row = (address & 0xff) + 2;
  const value = sim.getRange(row, 3).getValue();
  if (typeof value === 'number') {
    return value & 0xff;
  }
  const text = String(value || '00000000');
  return parseInt(text, 2) & 0xff;
}

function getInstructionText_(address, program) {
  const instruction = program[address];
  return instruction ? instruction.text : null;
}

function formatByte_(value) {
  return `${toHex_(value)}h`;
}

function toHex_(value) {
  return (value & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

function toBin_(value) {
  return (value & 0xff).toString(2).padStart(8, '0');
}
