// ---- send-certificates ----
// Corre sola una vez al día (ver netlify.toml). Revisa los pedidos que
// mp-webhook.js fue guardando, y a los que ya cumplieron 14 días desde
// la compra les genera el PDF del certificado y se lo envía por correo.

const { connectLambda, getStore } = require('@netlify/blobs');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

async function buildCertificatePdf(entry) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 420]); // A5 apaisado, aprox.
  const serif = await doc.embedFont(StandardFonts.TimesRomanBold);
  const serifRegular = await doc.embedFont(StandardFonts.TimesRoman);

  const ink = rgb(0.09, 0.09, 0.09);
  const gray = rgb(0.4, 0.4, 0.4);

  page.drawText('petitbox', {
    x: 48, y: 350, size: 22, font: serif, color: ink,
  });
  page.drawText('Grandmasters become alive', {
    x: 48, y: 330, size: 10, font: serifRegular, color: gray,
  });

  page.drawText('Certificate of Authenticity', {
    x: 48, y: 280, size: 18, font: serif, color: ink,
  });

  const buyerLine = entry.fullName
    ? `Issued to ${entry.fullName}`
    : `Issued to the holder of ${entry.email}`;
  page.drawText(buyerLine, {
    x: 48, y: 245, size: 12, font: serifRegular, color: ink,
  });

  page.drawText(entry.title, {
    x: 48, y: 215, size: 13, font: serif, color: ink,
  });

  const purchaseDate = new Date(entry.purchaseDate);
  const dateLabel = purchaseDate.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  page.drawText(`Commissioned on ${dateLabel}`, {
    x: 48, y: 195, size: 10, font: serifRegular, color: gray,
  });

  page.drawText(`Order reference: ${entry.orderId}`, {
    x: 48, y: 178, size: 9, font: serifRegular, color: gray,
  });

  page.drawText(
    'This piece was caught mid-transformation, from inside the box.',
    { x: 48, y: 120, size: 10, font: serifRegular, color: ink }
  );
  page.drawText('petitbox.art', {
    x: 48, y: 60, size: 9, font: serifRegular, color: gray,
  });

  return doc.save();
}

async function sendCertificateEmail(entry, pdfBytes) {
  const pdfBase64 = Buffer.from(pdfBytes).toString('base64');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'petitbox <certificates@petitbox.art>',
      to: [entry.email],
      subject: 'Your certificate of authenticity — petitbox',
      html: `<p>From inside the box, this is what makes it yours.</p><p>Attached is the certificate of authenticity for <b>${entry.title}</b>.</p><p>petitbox.art</p>`,
      attachments: [
        {
          filename: 'petitbox-certificate.pdf',
          content: pdfBase64,
        },
      ],
    }),
  });

  return res;
}

exports.handler = async (event) => {
  connectLambda(event);

  const store = getStore('pending-certificates');
  const { blobs } = await store.list();

  const now = new Date();
  let sentCount = 0;
  let errorCount = 0;

  for (const blob of blobs) {
    const entry = await store.get(blob.key, { type: 'json' });
    if (!entry || entry.sent) continue;

    const sendAfter = new Date(entry.sendAfter);
    if (sendAfter > now) continue; // todavía no cumple las dos semanas

    try {
      const pdfBytes = await buildCertificatePdf(entry);
      const emailRes = await sendCertificateEmail(entry, pdfBytes);

      if (emailRes.ok) {
        entry.sent = true;
        entry.sentAt = now.toISOString();
        await store.setJSON(blob.key, entry);
        sentCount += 1;
      } else {
        const errText = await emailRes.text();
        console.error(`send-certificates: fallo al enviar ${blob.key}:`, errText);
        errorCount += 1;
      }
    } catch (err) {
      console.error(`send-certificates: error con ${blob.key}:`, err);
      errorCount += 1;
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ sentCount, errorCount }),
  };
};
