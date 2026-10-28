# YDS Immo – Gestion des licences

Petite application web **séparée** du logiciel, réservée à l'administrateur (toi) :
créer une clé, la prolonger après un paiement, libérer un PC ou un téléphone, suspendre une licence.

## Mise en place
1. Dans Supabase (SQL Editor), lancer dans l'ordre : `schema.sql`, `schema-licence.sql`, `schema-admin.sql`.
2. Créer ton compte dans le logiciel YDS Immo (email + mot de passe).
3. Te donner les droits admin (SQL Editor) :
   `insert into public.admins (user_id) select id from auth.users where email = 'TON-EMAIL';`
4. Lancer l'outil : `npm install` puis `npm run dev`, ou le publier à part (Cloudflare Pages, dossier racine `admin`, commande `npm run build`, sortie `dist`).

Seul un compte présent dans la table `admins` peut utiliser les fonctions `admin_*`.
