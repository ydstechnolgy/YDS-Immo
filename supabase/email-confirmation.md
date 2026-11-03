# E-mail « Confirmation d'inscription » (à coller dans Supabase)

Supabase > Authentication > Emails > Templates > **Confirm sign up**.

**Subject (objet) :**

    Confirme ton email YDS Immo

**Message (corps, HTML) :**

```html
<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;background:#0b1426;color:#ffffff;border-radius:12px">
  <h2 style="margin:0 0 8px;color:#d4a843">YDS Immo</h2>
  <p>Bienvenue ! Voici ton code pour confirmer ton adresse email :</p>
  <p style="font-size:34px;font-weight:bold;letter-spacing:8px;text-align:center;margin:24px 0;color:#d4a843">{{ .Token }}</p>
  <p style="font-size:13px;color:#c8d3e8">Tape ce code dans l'application. Il est valable une heure. Si tu n'as pas créé de compte, ignore ce message.</p>
</div>
```

Ensuite : Authentication > Sign In / Providers > Email > activer **Confirm email**.
À faire APRÈS avoir installé la nouvelle version de l'application (sinon l'ancienne version ne sait pas demander le code).
