// utils/sendEmail.js
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // Gmail App Password
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
