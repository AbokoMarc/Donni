export type AuthParams = {
  Auth: undefined;
};

export type TabParams = {
  Accueil: undefined;
  Bilan: undefined;
  Notes: undefined;
  Reglages: undefined;
};

export type RootParams = {
  Tabs: undefined;
  Temps: undefined;
  Argent: undefined;
  Energie: undefined;
  Reseau: undefined;
  Direction: undefined;
  Competences: undefined;
  Habitudes: undefined;
  Objectif: {goalId: string};
  Contact: {contactId: string};
  Recherche: undefined;
  Conflits: undefined;
  Serveur: undefined;
  Notifications: undefined;
  Compte: undefined;
};

export type ModuleRoute = 'Temps' | 'Argent' | 'Energie' | 'Reseau' | 'Direction' | 'Competences';
