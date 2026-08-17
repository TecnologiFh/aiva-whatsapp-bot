// ==============================================================================
// AIVA Enterprise WhatsApp Webhook Gateway for Render.com
// Servidor 24/7 permanente con HTTPS gratis para Meta Cloud API
// ==============================================================================

const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'aiva_secure_verify_token_2026';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';

// 1. Endpoint GET de Verificación para Meta Developers (Desafío hub.challenge)
app.get('/', (req, res) => {
    res.json({
        status: 'ONLINE',
        system: 'AIVA WhatsApp Enterprise Gateway (Render.com Cloud 24/7)',
        timestamp: new Date().toISOString()
    });
});

app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'] || req.query['hub_mode'];
    const token = req.query['hub.verify_token'] || req.query['hub_verify_token'];
    const challenge = req.query['hub.challenge'] || req.query['hub_challenge'];

    if (mode === 'subscribe' && (token === VERIFY_TOKEN || !token)) {
        console.log('✅ Webhook verificado correctamente por Meta.');
        return res.status(200).send(challenge);
    }

    return res.status(200).send(challenge || 'AIVA Webhook Active');
});

// 2. Endpoint POST para Recepción de Mensajes de Clientes en Tiempo Real
app.post('/webhook', async (req, res) => {
    // Responder HTTP 200 OK inmediatamente a Meta
    res.status(200).send('EVENT_RECEIVED');

    try {
        const entry = req.body.entry?.[0]?.changes?.[0]?.value;
        const messages = entry?.messages;

        if (!messages || messages.length === 0) return;

        const rawMsg = messages[0];
        const from = rawMsg.from; // Número de WhatsApp del cliente
        const textBody = rawMsg.text?.body || '';

        console.log(`📩 Mensaje recibido de ${from}: "${textBody}"`);

        if (!textBody) return;

        // System Prompt con Reglas de Catálogo y Negocio
        const systemPrompt = `Eres AIVA, la Asistente Virtual Oficial de 'Pastelería Donuts Fs'.
Catálogo Oficial disponible:
- Dona Glaseada Clásica: S/ 4.50 (Stock: 3)
- Dona Doña Pepa: S/ 4.50 (Stock: 3)
- Dona Sublime: S/ 4.50 (Stock: 2)

REGLA DE ORO DE EMPRESA: Tu empresa ÚNICAMENTE vende donas artesanales, tortas y café. Si el cliente pide productos de otro rubro (como pollo a la brasa, pizza, etc.), explícale amablemente que no vendes ese producto y ofrécele las donas disponibles. Mantén un tono súper amable y entusiasta.`;

        let replyText = '';

        // Consultar a Google Gemini API
        if (GEMINI_API_KEY) {
            try {
                const geminiRes = await axios.post(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
                    {
                        contents: [
                            { role: 'user', parts: [{ text: `System: ${systemPrompt}\n\nCliente dice: ${textBody}` }] }
                        ]
                    },
                    { timeout: 10000 }
                );
                replyText = geminiRes.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            } catch (e) {
                console.error('⚠️ Error en Gemini API:', e.message);
            }
        }

        // Fallback a OpenAI si Gemini no respondió
        if (!replyText && OPENAI_API_KEY) {
            try {
                const openAiRes = await axios.post(
                    'https://api.openai.com/v1/chat/completions',
                    {
                        model: 'gpt-4o-mini',
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: textBody }
                        ]
                    },
                    {
                        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
                        timeout: 10000
                    }
                );
                replyText = openAiRes.data.choices?.[0]?.message?.content || '';
            } catch (e) {
                console.error('⚠️ Error en OpenAI API:', e.message);
            }
        }

        if (!replyText) {
            replyText = '¡Hola! Bienvenid@ a Pastelería Donuts Fs. ¿En qué te puedo ayudar hoy? 🍩';
        }

        // Responder al WhatsApp del Cliente mediante Meta Cloud API
        if (WHATSAPP_PHONE_NUMBER_ID && WHATSAPP_ACCESS_TOKEN) {
            await axios.post(
                `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
                {
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: from,
                    type: 'text',
                    text: { preview_url: false, body: replyText }
                },
                {
                    headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` }
                }
            );
            console.log(`📤 Respuesta enviada exitosamente a ${from}`);
        } else {
            console.log(`ℹ️ [Modo Prueba] Respuesta generada: "${replyText}"`);
        }

    } catch (error) {
        console.error('❌ Error procesando Webhook de WhatsApp:', error.message);
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor AIVA Gateway corriendo en puerto ${PORT}`);
});
