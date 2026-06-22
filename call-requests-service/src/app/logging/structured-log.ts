export type StructuredLogFields = Record<string, unknown>;

export type StructuredLogEntry = {
  event: string;
} & StructuredLogFields;

export function createStructuredLog(
  event: string,
  fields: StructuredLogFields = {},
): StructuredLogEntry {
  return {
    event,
    ...omitUndefined(fields),
  };
}

function omitUndefined(fields: StructuredLogFields): StructuredLogFields {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );
}
