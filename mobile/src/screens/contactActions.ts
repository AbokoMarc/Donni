import {Linking} from 'react-native';
import type {Repository} from '../db';
import {telUrl, whatsappUrl} from '../domain';
import type {Contact} from '../domain';

export type ContactChannel = 'call' | 'whatsapp';

/** Ouvre l'application externe puis consigne l'échange. Renvoie un message d'erreur si l'ouverture échoue. */
export async function reachContact(repo: Repository, contact: Contact, channel: ContactChannel): Promise<string | null> {
  if (!contact.phone) {
    return 'Aucun numéro enregistré pour ce contact.';
  }
  const url = channel === 'call' ? telUrl(contact.phone) : whatsappUrl(contact.phone);
  try {
    await Linking.openURL(url);
  } catch {
    return channel === 'call' ? 'Impossible d’ouvrir le composeur.' : 'WhatsApp n’est pas disponible sur ce téléphone.';
  }
  await repo.recordInteraction(contact.id, channel);
  return null;
}
