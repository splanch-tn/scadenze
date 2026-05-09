const axios = require('axios');

const FIREBASE_URL = process.env.FIREBASE_URL;
const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;
const EMAIL_DESTINATARIO = process.env.EMAIL_DESTINATARIO;

function oggi() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseData(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatData(s) {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

function giorniAllaScadenza(s) {
  const data = parseData(s);
  if (!data) return null;
  return Math.ceil((data - oggi()) / 86400000);
}

async function main() {
  console.log('Controllo scadenze in corso...');

  // Leggi prodotti da Firebase
  let prodotti = [];
  try {
    const res = await axios.get(`${FIREBASE_URL}/prodotti.json`);
    const data = res.data;
    if (data) {
      prodotti = Object.values(data);
    }
  } catch (e) {
    console.error('Errore lettura Firebase:', e.message);
    process.exit(1);
  }

  console.log(`Trovati ${prodotti.length} prodotti`);

  // Filtra prodotti in scadenza entro 7 giorni
  const inScadenza = prodotti.filter(p => {
    if (!p.date) return false;
    const giorni = giorniAllaScadenza(p.date);
    return giorni !== null && giorni >= 0 && giorni <= 7;
  });

  const scaduti = prodotti.filter(p => {
    if (!p.date) return false;
    const giorni = giorniAllaScadenza(p.date);
    return giorni !== null && giorni < 0;
  });

  console.log(`In scadenza (7 giorni): ${inScadenza.length}`);
  console.log(`Scaduti: ${scaduti.length}`);

  if (inScadenza.length === 0 && scaduti.length === 0) {
    console.log('Nessuna notifica da inviare.');
    return;
  }

  // Costruisci testo email
  let testo = '';

  if (inScadenza.length > 0) {
    testo += '🕐 IN SCADENZA NEI PROSSIMI 7 GIORNI:\n';
    inScadenza
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .forEach(p => {
        const giorni = giorniAllaScadenza(p.date);
        const meta = [p.brand, p.cat].filter(Boolean).join(' · ');
        testo += `• ${p.name}${meta ? ' (' + meta + ')' : ''} — scade il ${formatData(p.date)}`;
        testo += giorni === 0 ? ' ⚠️ OGGI!\n' : ` (tra ${giorni} giorni)\n`;
      });
  }

  if (scaduti.length > 0) {
    testo += '\n❌ GIÀ SCADUTI:\n';
    scaduti
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .forEach(p => {
        const giorni = Math.abs(giorniAllaScadenza(p.date));
        const meta = [p.brand, p.cat].filter(Boolean).join(' · ');
        testo += `• ${p.name}${meta ? ' (' + meta + ')' : ''} — scaduto il ${formatData(p.date)} (${giorni} giorni fa)\n`;
      });
  }

  console.log('Testo email:\n', testo);

  // Manda email via EmailJS
  try {
    const res = await axios.post('https://api.emailjs.com/api/v1.0/email/send', {
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      accessToken: process.env.EMAILJS_PRIVATE_KEY,
      template_params: {
        prodotti: testo,
        to_email: EMAIL_DESTINATARIO,
      }
    });
    console.log('Email inviata:', res.status);
  } catch (e) {
    console.error('Errore invio email:', e.response?.data || e.message);
    process.exit(1);
  }
}

main();
