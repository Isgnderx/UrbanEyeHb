const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const CDSE_TOKEN_URL = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';

app.get('/health', (req, res) => {
    res.json({ ok: true, service: 'urban-copernicus-proxy' });
});

app.post('/token', async (req, res) => {
    try {
        const clientId = process.env.CDSE_CLIENT_ID;
        const clientSecret = process.env.CDSE_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            return res.status(500).json({
                error: 'Missing env vars',
                details: 'Set CDSE_CLIENT_ID and CDSE_CLIENT_SECRET in backend/.env'
            });
        }

        const body = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret
        });

        const tokenRes = await fetch(CDSE_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body
        });

        const text = await tokenRes.text();
        if (!tokenRes.ok) {
            return res.status(tokenRes.status).json({
                error: 'CDSE auth failed',
                upstream: text
            });
        }

        let payload;
        try {
            payload = JSON.parse(text);
        } catch {
            return res.status(502).json({ error: 'Invalid CDSE response', upstream: text });
        }

        return res.status(200).json(payload);
    } catch (err) {
        return res.status(500).json({
            error: 'Token proxy failed',
            message: err && err.message ? err.message : 'Unknown error'
        });
    }
});

app.listen(PORT, () => {
    console.log(`Token proxy listening on http://localhost:${PORT}`);
});
