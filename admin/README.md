# YDS Immo – Gestion des licences

Petite application web **séparée** du logiciel, réservée à l'administrateur (toi) :
créer une clé, enregistrer un paiement, prolonger, fixer une date de fin, libérer un PC ou un téléphone,
suspendre et réactiver une licence.

## Règles (identiques à YDS Beauty)
- La durée d'une clé commence quand le client l'**active**, pas quand tu la crées.
- 1 PC + 1 téléphone par licence (modifiable avec « Modifier »).
- Après la date de fin : **7 jours de grâce** (le logiciel marche, avec un avertissement), puis il se bloque.
- Hors ligne : le logiciel reste utilisable **30 jours** après sa dernière vérification en ligne.
- Un client peut remplacer lui-même son PC ou son téléphone **une fois tous les 30 jours**.
- 10 clés incorrectes en une heure : blocage temporaire du compte.

## Mise en place
1. Dans Supabase (SQL Editor), lancer dans l'ordre : `schema.sql`, `schema-licence.sql`, `schema-admin.sql`,
   puis `schema-licence-v2.sql`.
2. Créer ton compte (Supabase > Authentication > Users > Add user, avec « Auto Confirm User »).
3. Te donner les droits admin (SQL Editor) :
   `insert into public.admins (user_id) select id from auth.users where email = 'TON-EMAIL' returning user_id;`
4. Lancer l'outil : `npm install` puis `npm run dev`, ou le publier à part (Cloudflare Pages, dossier racine `admin`,
   commande `npm run build`, sortie `dist`).

Seul un compte présent dans la table `admins` peut utiliser les fonctions `admin_*`.
