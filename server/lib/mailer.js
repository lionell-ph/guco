const nodemailer = require('nodemailer');
const config = require('../config');

let transporter = null;
if (config.smtp.host) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined
  });
}

/* With no SMTP_HOST (development) the message is printed to the console instead of sent. */
async function sendMail(message) {
  if (!transporter) {
    console.log('\n[mail - SMTP not configured, printing instead]\nTo: ' + message.to +
      '\nSubject: ' + message.subject + '\n' + message.text + '\n');
    return;
  }
  await transporter.sendMail({ from: config.smtp.from, to: message.to, subject: message.subject, text: message.text, html: message.html });
}

module.exports = { sendMail };
