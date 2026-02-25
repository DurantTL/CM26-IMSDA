module.exports = {
  apps : [{
    name: "cm26",
    script: "./server.js",
    env: {
      NODE_ENV: "production",
      PORT: 3000,
      GOOGLE_SCRIPT_URL: "https://script.google.com/macros/s/AKfycb.../exec",
      DB_HOST: "127.0.0.1",
      DB_NAME: "s201768_cm26_ims",
      DB_USERNAME: "u201768_cm26_ims",
      DB_PASSWORD: "FK7xIS58tHgPRFYg"
    }
  }]
}
