# E-mail « Mot de passe oublié » (à coller dans Supabase)

Supabase > Authentication > Emails > Templates > **Reset Password** (ou « Recovery »).

**Subject (objet) :**

    Ton code YDS Immo

**Message (corps, HTML) :**

```html
<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;background:#0b1426;color:#ffffff;border-radius:12px">
  <h2 style="margin:0 0 8px;color:#d4a843">YDS Immo</h2>
  <p>Tu as demandé à changer ton mot de passe. Voici ton code :</p>
  <p style="font-size:34px;font-weight:bold;letter-spacing:8px;text-align:center;margin:24px 0;color:#d4a843">{{ .Token }}</p>
  <p style="font-size:13px;color:#c8d3e8">Tape ce code dans l'application avec ton nouveau mot de passe. Il est valable une heure. Si ce n'est pas toi, ignore ce message.</p>
</div>
```

Le code a 6 chiffres (Authentication > Sign In / Providers > Email : « Email OTP Length » = 6).
