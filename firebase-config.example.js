// ═══════════════════════════════════════════════════
//  CONFIGURAÇÃO DO FIREBASE — Nati Cetim
//
//  INSTRUÇÕES:
//  1. Copie este arquivo e renomeie para: firebase-config.js
//  2. Preencha com as suas credenciais do Firebase Console
//     (console.firebase.google.com → seu projeto → ⚙ → Configurações → Seus apps)
//  3. Mude FIREBASE_ENABLED para true
// ═══════════════════════════════════════════════════

window.FIREBASE_CONFIG = {
  apiKey: "SUA_API_KEY_AQUI",
  authDomain: "seu-projeto.firebaseapp.com",
  databaseURL: "https://seu-projeto-default-rtdb.firebaseio.com",
  projectId: "seu-projeto",
  storageBucket: "seu-projeto.firebasestorage.app",
  messagingSenderId: "SEU_SENDER_ID",
  appId: "SEU_APP_ID"
};

// Mude para true após preencher as credenciais acima
window.FIREBASE_ENABLED = false;
