// utils/sendEmail.js
const nodemailer = require("nodemailer");

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // MUST be false for port 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // Gmail App Password
  },
  tls: {
    rejectUnauthorized: false,
  },
});

const sendEmail = async ({ to, subject, text, html }) => {
  try {
    await transporter.sendMail({
      from: `"ClassCraft" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html, // optional
    });
  } catch (err) {
    console.error("❌ Email send failed:", err.message);
    throw new Error("Email could not be sent");
  }
};

module.exports = sendEmail;
