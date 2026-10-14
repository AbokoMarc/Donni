import {isDay, isTime} from '../domain/dates';
import type {EntityDef, FieldDef} from './entities';

export class ValidationError extends Error {
  readonly entity: string;
  readonly field: string;

  constructor(entity: string, field: string, message: string) {
    super(`${entity}.${field} : ${message}`);
    this.name = 'ValidationError';
    this.entity = entity;
    this.field = field;
  }
}

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function checkFormat(field: FieldDef, value: string): boolean {
  switch (field.format) {
    case 'time':
      return isTime(value);
    case 'day':
      return isDay(value);
    case 'month':
      return MONTH.test(value);
    case 'instant':
      return INSTANT.test(value) && !Number.isNaN(Date.parse(value));
    default:
      return true;
  }
}

export function validateRecord(def: EntityDef, data: Record<string, unknown>): void {
  for (const field of def.fields) {
    const value = data[field.name];
    if (value === null || value === undefined) {
      if (field.required) {
        throw new ValidationError(def.name, field.name, 'valeur requise');
      }
      continue;
    }
    if (field.kind === 'text' && typeof value !== 'string') {
      throw new ValidationError(def.name, field.name, 'texte attendu');
    }
    if (field.kind === 'text' && field.required && String(value).trim() === '') {
      throw new ValidationError(def.name, field.name, 'valeur requise');
    }
    if ((field.kind === 'int' || field.kind === 'real') && !Number.isFinite(value)) {
      throw new ValidationError(def.name, field.name, 'nombre attendu');
    }
    if (field.kind === 'int' && !Number.isInteger(value)) {
      throw new ValidationError(def.name, field.name, 'entier attendu');
    }
    if (field.kind === 'bool' && typeof value !== 'boolean') {
      throw new ValidationError(def.name, field.name, 'booléen attendu');
    }
    if (field.oneOf && !field.oneOf.includes(value as string | number)) {
      throw new ValidationError(def.name, field.name, 'valeur inconnue');
    }
    if (typeof value === 'number') {
      if (field.min !== undefined && value < field.min) {
        throw new ValidationError(def.name, field.name, 'valeur trop basse');
      }
      if (field.max !== undefined && value > field.max) {
        throw new ValidationError(def.name, field.name, 'valeur trop haute');
      }
    }
    if (field.format && typeof value === 'string' && !checkFormat(field, value)) {
      throw new ValidationError(def.name, field.name, 'format invalide');
    }
  }
}
