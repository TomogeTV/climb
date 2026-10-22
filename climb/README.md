# CLIMB

Ton partenaire sportif : muscu, course à pied, randonnée et escalade, avec tes groupes (collègues, association, amis).

Application web statique (aucune compilation) : elle se publie telle quelle sur GitHub Pages et s'installe sur l'écran d'accueil de l'iPhone. Les données sont dans le projet Supabase **climb** (`bgapazyjcdcoffjfxgjm`, région Paris), séparé de la base de l'association.

## Contenu

| Fichier | Rôle |
|---|---|
| `index.html` + `js/app.js` | Comptes, accueil, fil, activités (GPX, carte), groupes, classements, profil |
| `carnet.html` | Le carnet privé : nutrition, séances de muscu, poids, mesures, sauvegardes |
| `js/core.js` | Connexion Supabase, sports, programmes proposés, calcul des calories |
| `js/gpx.js` | Lecture des fichiers GPX (montres, Garmin, Strava…) |
| `js/config.js` | Adresse du projet Supabase et clé publique |
| `css/`, `fonts/`, `icons/`, `vendor/` | Styles, polices Barlow, icônes, Supabase JS 2.116 et Leaflet 1.9.4 (hébergés ici, sans CDN) |
| `manifest.webmanifest`, `sw.js` | Installation sur l'écran d'accueil et ouverture hors ligne |

La clé dans `js/config.js` est la clé **publishable** : elle est faite pour être publique. La protection des données est assurée par les règles de la base (RLS), déjà en place et testées.

## 1. Mettre en ligne sur GitHub Pages

1. Crée un dépôt sur GitHub (par exemple `climb`), public ou privé (Pages sur dépôt privé demande un compte payant).
2. Dépose **le contenu** du dossier (pas le dossier lui-même) à la racine du dépôt, fichier `.nojekyll` compris.
3. Dépôt → **Settings → Pages** → Source : *Deploy from a branch*, branche `main`, dossier `/ (root)` → Save.
4. Dans **Custom domain**, saisis ton sous-domaine, par exemple `climb.ton-domaine.fr`, puis Save. GitHub crée le fichier `CNAME` dans le dépôt.
5. Coche **Enforce HTTPS** dès que la case est disponible (quelques minutes à quelques heures).

## 2. Brancher le sous-domaine chez OVH

OVH → Web Cloud → Noms de domaine → ton domaine → **Zone DNS** → Ajouter une entrée :

- Type : **CNAME**
- Sous-domaine : `climb`
- Cible : `ton-compte-github.github.io.` (avec le point final)

La propagation prend de quelques minutes à quelques heures. Vérifie ensuite que `https://climb.ton-domaine.fr` ouvre l'écran de connexion.

## 3. Régler Supabase (une seule fois, dans le tableau de bord)

Projet **climb** → **Authentication → URL Configuration** :

- **Site URL** : `https://climb.ton-domaine.fr`
- **Redirect URLs** : ajoute `https://climb.ton-domaine.fr/**`

Sans ce réglage, les liens de confirmation et de mot de passe oublié renvoient vers une mauvaise adresse.

**Authentication → Sign In / Providers → Email** : laisse « Confirm email » activé (recommandé).

## 4. Envoyer les emails avec Brevo

Le serveur d'emails intégré à Supabase est limité à quelques messages par heure : il faut Brevo dès qu'il y a plusieurs inscrits.

1. Brevo → **Expéditeurs, domaines et IP dédiées** → Domaines : authentifie ton domaine (enregistrements DKIM et DMARC à ajouter dans la zone DNS OVH, Brevo les donne).
2. Brevo → **SMTP et API** → onglet SMTP : note le serveur `smtp-relay.brevo.com`, le port `587`, l'identifiant, et génère une **clé SMTP**.
3. Supabase → **Authentication → Emails → SMTP Settings** → Enable custom SMTP :
   - Sender email : `climb@ton-domaine.fr`, Sender name : `CLIMB`
   - Host `smtp-relay.brevo.com`, Port `587`, Username = identifiant Brevo, Password = clé SMTP
4. Toujours dans **Emails → Templates**, tu peux traduire les modèles en français (confirmation d'inscription, réinitialisation du mot de passe).
5. **Authentication → Rate Limits** : remonte la limite d'emails par heure (30 par exemple).

## 5. Installer sur l'iPhone

Ouvre l'adresse dans **Safari** → bouton Partager → **Sur l'écran d'accueil**. CLIMB s'ouvre ensuite en plein écran, comme une app.

## 6. Récupérer l'historique de l'ancien carnet

1. Dans l'ancien carnet (l'artifact Claude) : Progrès → Archives → **Sauvegarder tout** → un fichier `carnet-sauvegarde-AAAA-MM-JJ.json` est téléchargé.
2. Dans CLIMB, crée ton compte, puis Carnet → Progrès → Archives → **Restaurer une sauvegarde** → choisis le fichier.

Repas, pesées, mesures, séances et programme sont importés. Les séances terminées et les courses sont aussi ajoutées à ton profil CLIMB (visibles par tes groupes si le partage est activé dans Carnet → Profil → Partage).

## Ce qui est privé, ce qui est partagé

- **Partagé avec les membres de tes groupes** : prénom, couleur, ville, sports, activités en visibilité « Mes groupes », bravos et commentaires.
- **Toujours privé** : tout le carnet (poids, mensurations, repas, sommeil, check-in, objectifs), les activités en « Moi seulement », ton email.
- Quelqu'un qui n'a aucun groupe en commun avec toi ne voit rien de toi.

## Cartes

Les fonds de carte viennent d'OpenStreetMap (attribution affichée sur chaque carte). Leur usage est gratuit pour un trafic modéré comme celui d'un club ; au-delà de quelques centaines d'utilisateurs actifs, il faudra passer par un fournisseur de tuiles (MapTiler, Stadia, IGN Géoplateforme…), en changeant une seule ligne dans `js/app.js`.

## Mettre à jour l'app

Remplace les fichiers dans le dépôt GitHub. Pour que les téléphones prennent la nouvelle version tout de suite, augmente aussi `VERSION` dans `sw.js` (par exemple `climb-v2`).

## Prochaines étapes prévues

- **Phase 2** : coach Claude dans l'app. Chaque membre colle sa propre clé API Anthropic (stockée chiffrée côté serveur, jamais dans le navigateur) ; il pourra discuter avec le coach, faire analyser un repas ou une étiquette et créer ses séances sur ses conseils.
- **Phase 3** : défis de groupe et sorties communes (rando, falaise) avec inscriptions.
- **Phase 4** : emails automatiques via Brevo (bilan de la semaine, rappels, invitations), notifications, et éventuellement une app iPhone native.

Fermeture complète d'un compte : « Supprimer toutes mes données » efface tout le contenu ; l'administrateur supprime ensuite l'utilisateur dans Supabase → Authentication → Users.
