import { OPERATIONAL_INTENTS } from './intents.mjs';
import { parseIndonesianNumber } from './parser.mjs';

const flows = new Map();

const productMenu = {
  title: 'Formulir Operasional',
  text: 'Pilih tindakan operasional:',
  buttonText: 'Pilih tindakan',
  sections: [{ title: 'Operasional', rows: [
    { id: 'FORM_ADD_PRODUCT', title: 'Tambah Produk', description: 'Catat produk baru' },
    { id: 'FORM_STOCK', title: 'Stok', description: 'Kelola stok produk' },
    { id: 'FORM_SALE', title: 'Penjualan', description: 'Catat penjualan' },
    { id: 'FORM_INCOME', title: 'Pemasukan', description: 'Catat pemasukan' },
    { id: 'FORM_EXPENSE', title: 'Pengeluaran', description: 'Catat pengeluaran' }
  ] }]
};

function keyOf(businessId, senderPhone) {
  return `${businessId}:${senderPhone}`;
}

function clear(businessId, senderPhone) {
  flows.delete(keyOf(businessId, senderPhone));
}

export function unwrapMessage(message) {
  let content = message?.message || message || {};
  for (let i = 0; i < 5; i++) {
    if (content?.ephemeralMessage?.message) {
      content = content.ephemeralMessage.message;
    } else if (content?.viewOnceMessage?.message) {
      content = content.viewOnceMessage.message;
    } else if (content?.viewOnceMessageV2?.message) {
      content = content.viewOnceMessageV2.message;
    } else if (content?.viewOnceMessageV2Extension?.message) {
      content = content.viewOnceMessageV2Extension.message;
    } else if (content?.documentWithCaptionMessage?.message) {
      content = content.documentWithCaptionMessage.message;
    } else if (content?.editedMessage?.message?.protocolMessage?.editedMessage) {
      content = content.editedMessage.message.protocolMessage.editedMessage;
    } else {
      break;
    }
  }
  return content;
}

export function getInteractiveSelection(message) {
  const content = unwrapMessage(message);
  if (content.buttonsResponseMessage?.selectedButtonId) return content.buttonsResponseMessage.selectedButtonId;
  if (content.buttonsResponseMessage?.selectedDisplayText) return content.buttonsResponseMessage.selectedDisplayText;
  if (content.listResponseMessage?.singleSelectReply?.selectedRowId) return content.listResponseMessage.singleSelectReply.selectedRowId;
  if (content.listResponseMessage?.title) return content.listResponseMessage.title;
  if (content.templateButtonReplyMessage?.selectedId) return content.templateButtonReplyMessage.selectedId;
  if (content.templateButtonReplyMessage?.selectedDisplayText) return content.templateButtonReplyMessage.selectedDisplayText;
  const nativeParams = content.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  if (nativeParams) {
    try {
      const parsed = JSON.parse(nativeParams);
      return parsed.id || parsed.selected_id || parsed.row_id || parsed.button_id || parsed.display_text || '';
    } catch { return ''; }
  }
  return content.conversation || content.extendedTextMessage?.text || content.text || '';
}

export function formatInteractiveFallback(interactive) {
  if (!interactive) return '';
  if (interactive.kind === 'list') {
    const header = interactive.title ? `*${interactive.title}*\n` : '';
    const body = interactive.text ? `${interactive.text}\n\n` : '';
    const sectionsText = (interactive.sections || []).map(sec => {
      const rows = (sec.rows || []).map(r => `• *${r.id}*: ${r.title}${r.description ? ` (${r.description})` : ''}`).join('\n');
      return `${sec.title ? `*${sec.title}*:\n` : ''}${rows}`;
    }).join('\n\n');
    return `${header}${body}${sectionsText}\n\n_Ketik salah satu kode pilihan di atas._`.trim();
  }
  const body = interactive.text ? `${interactive.text}\n\n` : '';
  const btnText = (interactive.buttons || []).map((b, i) => `${i + 1}. *${b.title}* (ketik: *${b.id}*)`).join('\n');
  const footer = interactive.footer ? `\n\n_${interactive.footer}_` : '';
  return `${body}Pilihan:\n${btnText}${footer}`.trim();
}

export function greetingInteractive() {
  return {
    kind: 'buttons',
    text: '👋 Halo! Selamat datang di BisnisSehat.\nMau menggunakan apa?',
    footer: 'BisnisSehat',
    buttons: [
      { id: 'MODE_AI', title: '🤖 AI BisnisSehat' },
      { id: 'MODE_FORM', title: '📋 Formulir Operasional' }
    ]
  };
}

export async function advanceConversation({ businessId, senderPhone, input, execute }) {
  const value = String(input || '').trim();
  const key = keyOf(businessId, senderPhone);
  const state = flows.get(key);

  if (/^\/(?:hai|help|menu)$/i.test(value)) {
    flows.set(key, { step: 'landing' });
    return { handled: true, interactive: greetingInteractive() };
  }
  if (!state) return { handled: false };
  if (/^(?:CANCEL_FORM|BATAL|❌\s*Batal)$/i.test(value)) {
    clear(businessId, senderPhone);
    return { handled: true, text: 'Formulir dibatalkan. Tidak ada data yang disimpan.' };
  }

  if (state.step === 'landing') {
    if (/^(?:MODE_AI|ai|\/ai|1|gunakan\s+ai|🤖\s*ai\s*bisnissehat|🤖\s*gunakan\s+ai)$/i.test(value)) {
      clear(businessId, senderPhone);
      const result = await execute({ intent: OPERATIONAL_INTENTS.SELECT_AI_MODE, source: 'whatsapp_interactive', data: {} });
      return { handled: true, text: result.message };
    }
    if (/^(?:MODE_FORM|form|\/form|2|gunakan\s+formulir|📋\s*formulir\s*operasional|📋\s*gunakan\s+formulir)$/i.test(value)) {
      flows.set(key, { step: 'form_menu' });
      return { handled: true, interactive: { kind: 'list', ...productMenu } };
    }
    return { handled: true, interactive: greetingInteractive() };
  }

  if (state.step === 'form_menu') {
    if (value === 'FORM_ADD_PRODUCT' || /^tambah produk$/i.test(value)) {
      flows.set(key, { step: 'product_name', data: {} });
      return { handled: true, text: '📦 Nama produk?' };
    }
    return { handled: true, text: 'Tindakan ini belum tersedia dalam form chat. Pilih *Tambah Produk*.' };
  }

  if (state.step === 'product_name') {
    flows.set(key, { step: 'product_purchase_price', data: { name: value } });
    return { handled: true, text: '💰 Harga beli?' };
  }
  if (state.step === 'product_purchase_price') {
    const purchasePrice = parseIndonesianNumber(value);
    if (!Number.isFinite(purchasePrice) || purchasePrice < 0) return { handled: true, text: 'Harga beli harus berupa angka valid.' };
    flows.set(key, { step: 'product_selling_price', data: { ...state.data, purchase_price: purchasePrice } });
    return { handled: true, text: '💵 Harga jual?' };
  }
  if (state.step === 'product_selling_price') {
    const sellingPrice = parseIndonesianNumber(value);
    if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) return { handled: true, text: 'Harga jual harus lebih besar dari nol.' };
    flows.set(key, { step: 'product_stock', data: { ...state.data, selling_price: sellingPrice } });
    return { handled: true, text: '📦 Stok awal?' };
  }
  if (state.step === 'product_stock') {
    const initialStock = parseIndonesianNumber(value);
    if (!Number.isFinite(initialStock) || initialStock < 0) return { handled: true, text: 'Stok awal harus berupa angka nol atau lebih.' };
    flows.set(key, { step: 'product_location', data: { ...state.data, initial_stock: initialStock } });
    return { handled: true, interactive: { kind: 'list', title: 'Lokasi stok', text: '📍 Lokasi stok?', buttonText: 'Pilih lokasi', sections: [{ title: 'Lokasi', rows: [{ id: 'LOCATION_GUDANG_UTAMA', title: 'Gudang Utama' }] }] } };
  }
  if (state.step === 'product_location') {
    const warehouse = value === 'LOCATION_GUDANG_UTAMA' ? 'Gudang Utama' : value;
    const data = { ...state.data, warehouse, unit: 'pcs' };
    flows.set(key, { step: 'product_confirm', data });
    return { handled: true, interactive: { kind: 'buttons', text: `Periksa data:\n\nProduk: *${data.name}*\nHarga beli: ${data.purchase_price}\nHarga jual: ${data.selling_price}\nStok awal: ${data.initial_stock}\nLokasi: ${data.warehouse}`, footer: 'Simpan data ini?', buttons: [{ id: 'SAVE_PRODUCT', title: '✅ Simpan' }, { id: 'CANCEL_FORM', title: '❌ Batal' }] } };
  }
  if (state.step === 'product_confirm') {
    if (!/^(?:SAVE_PRODUCT|SIMPAN|✅\s*Simpan)$/i.test(value)) return { handled: true, text: 'Pilih Simpan atau Batal.' };
    clear(businessId, senderPhone);
    const result = await execute({ intent: OPERATIONAL_INTENTS.CREATE_PRODUCT, source: 'whatsapp_form', data: state.data });
    return { handled: true, text: result.message, result };
  }
  clear(businessId, senderPhone);
  return { handled: false };
}

export function getConversationState(businessId, senderPhone) {
  return flows.get(keyOf(businessId, senderPhone)) || null;
}
