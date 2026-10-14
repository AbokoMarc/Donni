# Design

Références visuelles : `docs/design/*.jpg`. Chaque écran existe en lecture et en modification ; le diagramme `flux.jpg` décrit la navigation.

## Principes

Calme, chaleureux, sobre. Fond crème, encre bleu nuit, un seul accent brun pour les libellés. Peu de couleurs : orange et vert/rouge n'apparaissent que dans Argent (entrées, crédit, dette). Pas de dégradés, pas d'ombres lourdes, pas d'emojis, pas d'illustrations. Les icônes (Lucide) sont fonctionnelles, trait de 1,75, taille 20 par défaut.

## Jetons

| Rôle | Valeur |
| --- | --- |
| `bg` fond d'écran | `#F9EFE6` |
| `surface` cartes | `#FBF1E8` |
| `surfaceAlt` zones et pastilles | `#F3E5D8` |
| `sunken` zone en pointillés, piste de progression | `#E9D8C6` |
| `ink` texte principal, boutons pleins | `#101C46` |
| `inkSoft` texte secondaire | `#4A5070` |
| `label` libellés de champ | `#8A4E32` |
| `muted` texte discret, placeholders | `#9A8F89` |
| `border` contours | `#D3A58C` |
| `borderSoft` séparateurs | `#EBD9CA` |
| `accent` orange (entrées) | `#F3751E` |
| `positive` | `#1F7A3E` |
| `negative` | `#A8201A` |
| `onInk` texte sur fond encre | `#FBF1E8` |

Rayons : champs et boutons 12, cartes 16, pastilles 999. Espacement de base 4 (4, 8, 12, 16, 20, 24, 32). Marges d'écran 20. Contours 1 px `border` sur champs et cartes de saisie, cartes de lecture sans contour avec fond `surface`. Zone tactile minimale 44.

## Typographie

- Marque DONNI (écran d'inscription) : Playfair Display, 400, capitales, espacement des lettres léger, taille 56.
- Tout le reste : Inter. Titres de module (TEMPS, ARGENT…) 40 en 700 sur le dashboard détaillé, capitales ; titre de carte 18 en 600 ; corps 16 en 400 ; légende 13 ; libellé de champ 14 en 500 couleur `label`.
- Les fichiers de police (Inter 400/500/600/700, Playfair Display 400) sont embarqués dans l'application (`mobile/assets/fonts`), la taille de police système Android est respectée (`allowFontScaling` actif, plafonné à 1,3).

## Écrans

### Inscription (`inscription.jpg`)

Wordmark DONNI centré en Playfair, signature « Ton temps. Ton argent. Ta direction. » en 16 `ink`. Trois champs empilés (24 d'écart) : Nom complet, Numéro WhatsApp (préfixe `+237` avec chevron dans le champ, placeholder `6 xx xx xx xx`), Mot de passe (œil pour afficher). Bouton plein encre « Commencer avec DONNI » hauteur 52. Dessous, mention légale en 12 centrée, puis « Sécurisé · Vos données sont protégées » avec cadenas, en bas. L'écran de connexion reprend exactement la même composition (sans Nom complet, bouton « Se connecter », lien « Mot de passe oublié ? », bascule entre les deux).

### Accueil, « Vue du jour » (`accueil.jpg`)

En-tête : « DONNI life OS » 32 en 700, avatar rond avec initiale à droite, sous-titre date en `muted`. Puis une colonne de cartes `surface`, une par module, chacune avec icône + libellé en capitales 14 :

- TEMPS : frise horizontale 7h–22h avec repère « maintenant », échéance affichée en dessous.
- ARGENT : solde en 28 en 700, deux pastilles « Dette » et « Crédit ».
- ÉNERGIE : quatre pictos (Sommeil, Humeur, Sport, Eau) avec légende.
- RÉSEAU : deux contacts à relancer (avatar, nom, rôle et « il y a 2j »), bouton pastille « Relancer ».
- COMPÉTENCES : pourcentage, barre fine, nom de la compétence, objectif mensuel en FCFA.
- WHATSAPP : dernière activité (affichée seulement si le module est actif).

Chaque carte ouvre la vue détaillée du module. Barre d'onglets en bas : Accueil, Bilan, Notes, Réglages (4 icônes sans libellé visible mais avec libellé d'accessibilité ; l'actif en encre pleine, les autres en `muted`). Bouton « + » de capture rapide flottant au-dessus de la barre, à droite.

### Lecture seule et modification

Chaque module a deux états. En lecture, une pastille « Lecture seule » avec cadenas ; un bouton « Modifier » (pastille encre avec crayon) ouvre le mode modification : en-tête avec « Terminé » (ou « Enregistrer / Annuler » pour Énergie), champs éditables entourés d'un contour `border`, icônes crayon et corbeille, bouton en pointillés « Ajouter … » en bas. Les changements sont enregistrés automatiquement dans la base locale ; « Terminé » revient en lecture.

### Temps (`temps-lecture.jpg`, `temps-modification.jpg`)

Lecture : « DONNI · life OS », titre TEMPS, pastille Lecture seule, carte « Progression du jour » avec grand pourcentage et barre, trois tuiles Focus / Pause / Restant (durées), section CHRONOLOGIE : lignes heure + titre + sous-titre (« 1h30 · En cours · 58 % accompli »).

Modification : pastille « DONNI life OS » et interrupteur « Mode Focus », titre TEMPS, bouton « Modifier », ligne de date « Lun. 7 oct. · Aujourd'hui — Édition activée », bandeau d'aide. Chaque créneau est une carte : poignée de glisser (trois barres) à gauche reliée par une ligne pointillée verticale, Heure début / Heure fin (champs avec crayon qui ouvrent un sélecteur d'heure), Titre, Durée recalculée, corbeille. Réorganisation par glisser. Bouton « Ajouter créneau » en pointillés, conseil en bas.

### Argent (`argent-lecture.jpg`, `argent-modification.jpg`)

Lecture : carte Solde Mobile Money (icône neutre, solde, fournisseur, « Compte principal »), deux tuiles Dette (rouge) / Crédit (vert), carte « Entrées · Sorties » en barres groupées par période (orange = entrées, encre = sorties), liste Transactions (pastille ronde + ou −, date, libellé, montant coloré). Le logo d'un opérateur n'est pas reproduit : seule une icône de portefeuille neutre est utilisée.

Modification : trois cartes (Solde, Dette avec échéance et contrepartie, Crédit avec remboursement prévu) chacune avec crayon ; graphique en courbes ; bouton « Ajouter transaction » ; chaque transaction a ses champs date, libellé, montant éditables.

### Énergie (`energie-lecture.jpg`, `energie-modification.jpg`)

Lecture : carte « Objectifs journaliers » avec anneau de pourcentage, puis une carte par métrique : icône dans carré encre, nom, valeur / objectif, barre de progression, phrase d'état (« Cible atteinte · 5h30 de sommeil »). Tendances calculées uniquement depuis les données réelles, jamais de diagnostic.

Modification : « EDIT MODE », cartes avec curseur (Sommeil, Humeur en liste déroulante, Sport et Eau avec − / +), conversion verres → litres (1 verre = 0,25 L), corbeille, « Ajouter une métrique », boutons Annuler / Enregistrer en bas (ici l'enregistrement est explicite).

### Réseau (`reseau-lecture.jpg`, `reseau-modification.jpg`)

Lecture : cartes contact (avatar rond encre avec initiale ou icône, « Famille — Maman », notes à puces, pastille d'état « Prévu · Dim. 12 oct. », « Mensuel · Demain 10:00 », « En suivi · Dernière activité 09 oct. », bouton encre « Appeler » qui lance l'appel ; second bouton « WhatsApp » si le numéro existe). Modification : nom, type de relation (liste), note, fréquence d'appel (liste « Hebdo · Dimanche », « Mensuel · 1er du mois »), crayon et corbeille, « Ajouter contact ».

### Direction (`direction-lecture.jpg`, `direction-modification.jpg`)

Lecture : pastille Lecture seule, bandeau « Données synchronisées » avec bouton de synchronisation, cartes objectif (Objectif 1, intitulé 24 en 600, Statut en pastille, Échéance, barre de progression et pourcentage). Modification : bandeau « MODE MODIFICATION », compteur « OBJECTIFS 2 », carte avec cible, crayon, corbeille, intitulé, Statut (liste), Échéance (sélecteur de date), Notes ; « Ajouter un objectif » ; « Les changements sont enregistrés automatiquement ». Les étapes, habitudes liées et notes d'un objectif s'ouvrent dans une page dédiée depuis la carte.

### Compétences (flux.jpg)

Module sixième du flux : liste de compétences avec niveau (barre et pourcentage) et objectif mensuel en FCFA ; mêmes deux états, mêmes composants que Direction.

### Écrans non maquettés

Bilan (onglet), Notes (onglet), Réglages (onglet), Habitudes (sous Direction), Capture rapide (feuille modale), Recherche globale, résolution de conflits : construits avec les mêmes composants et jetons, sans introduire de nouveau motif visuel. Si une fonctionnalité risque de charger un écran principal, elle va dans une page dédiée ou une feuille modale.

## Éléments réutilisables

`Screen` (fond, marges, défilement), `ModuleHeader` (titre, sous-titre, pastille de mode, action), `Card`, `StatTile`, `Pill`, `ProgressBar`, `RingProgress`, `Field` (libellé, valeur, crayon), `TextField`, `SelectField` (feuille de choix), `TimeField`, `DateField`, `PrimaryButton`, `GhostButton`, `DashedAddButton`, `IconButton`, `ConfirmSheet`, `SyncBanner`, `EmptyState`, `Avatar`, `BarChart`, `LineChart`.
