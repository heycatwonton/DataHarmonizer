import { isDate } from 'date-fns';
import {
  Datatypes,
  stringifyJsonSchemaDate,
  parseJsonSchemaDate,
  parseJsonDate,
  datatypeIsDateOrTime,
} from './datatypes';

const MULTIVALUED_DELIMITER = '; ';

/**
 * Modify a string to match specified case.
 * @param {String} val String to modify.
 * @param {String} capitalize Case to modify string to; one of `'UPPER'`,
 *     `'lower'` or `'Title'`.
 * @return {String} String with modified case.
 */
export function changeCase(val, field) {
  switch (field.structured_pattern.syntax) {
    case '{lower_case}':
      val = val.toLowerCase();
      break;
    case '{UPPER_CASE}':
      val = val.toUpperCase();
      break;
    case '{Title_Case}':
      val = val
        .split(' ')
        .map((w) => w[0].toUpperCase() + w.substr(1).toLowerCase())
        .join(' ');
      break;
  }
  return val;
}

/**
 * Test to see if col's field is followed by [field unit],[field bin] fields
 * @param {Object} fields See `data.js`.
 * @param {Integer} column of numeric field.
 */
export function fieldUnitBinTest(fields, col) {
  return (
    fields.length > col + 2 &&
    fields[col + 1].title == fields[col].title + ' unit' &&
    fields[col + 2].title == fields[col].title + ' bin'
  );
}

// parse failure behaviors
export const KEEP_ORIGINAL = 'KEEP_ORIGINAL';
export const REMOVE = 'REMOVE';
export const THROW_ERROR = 'THROW_ERROR';

// date formats
export const DATE_OBJECT = 'DATE_OBJECT';
export const JSON_SCHEMA_FORMAT = 'JSON_SCHEMA_FORMAT';
export const INPUT_FORMAT = 'INPUT_FORMAT';

export function dataArrayToObject(dataArray, fields, options = {}) {
  const {
    parseFailureBehavior,
    dateBehavior,
    dateFormat,
    datetimeFormat,
    timeFormat,
  } = {
    parseFailureBehavior: KEEP_ORIGINAL,
    dateBehavior: DATE_OBJECT,
    dateFormat: 'yyyy-MM-dd',
    datetimeFormat: 'yyyy-MM-dd HH:mm',
    timeFormat: 'HH:mm',
    ...options,
  };
  const datatypes = new Datatypes({
    dateFormat,
    datetimeFormat,
    timeFormat,
  });
  const formatDatesAndTimes = (dateObject, datatype) => {
    if (!isDate(dateObject)) {
      return dateObject;
    }
    if (dateBehavior === DATE_OBJECT) {
      return dateObject;
    }
    if (dateBehavior === INPUT_FORMAT) {
      return datatypes.stringify(dateObject, datatype);
    }
    if (dateBehavior === JSON_SCHEMA_FORMAT) {
      return stringifyJsonSchemaDate(dateObject, datatype);
    }
  };
  const getParsedValue = (originalValue, datatype) => {
    const parsedValue = datatypes.parse(originalValue, datatype);
    if (parsedValue !== undefined) {
      return formatDatesAndTimes(parsedValue, datatype);
    }
    if (parseFailureBehavior === KEEP_ORIGINAL) {
      return originalValue;
    }
    if (parseFailureBehavior === THROW_ERROR) {
      throw new Error(
        `Unable to parse value "${originalValue}" as datatype "${datatype}"`
      );
    }
    if (parseFailureBehavior === REMOVE) {
      return undefined;
    }
  };
  const dataObject = {};
  dataArray.forEach((cell, idx) => {
    if (cell === '' || cell == null) {
      return;
    }
    const field = fields[idx];
    let parsed;
    if (field.multivalued) {
      const split = parseMultivaluedValue(cell);
      parsed = split
        .map((cellElement) => getParsedValue(cellElement, field.datatype))
        .filter((parsedValue) => parsedValue !== undefined);
      if (parsed.length > 0) {
        dataObject[field.name] = parsed;
      }
    } else {
      dataObject[field.name] = getParsedValue(cell, field.datatype);
    }
  });
  return dataObject;
}

export function dataObjectToArray(dataObject, fields, options = {}) {
  const { serializedDateFormat, dateFormat, datetimeFormat, timeFormat } = {
    serializedDateFormat: DATE_OBJECT,
    dateFormat: 'yyyy-MM-dd',
    datetimeFormat: 'yyyy-MM-dd HH:mm',
    timeFormat: 'HH:mm',
    ...options,
  };
  const datatypes = new Datatypes({
    dateFormat,
    datetimeFormat,
    timeFormat,
  });
  const dataArray = Array(fields.length).fill('');
  const parseDateString = (dateString, datatype) => {
    if (serializedDateFormat === DATE_OBJECT) {
      return parseJsonDate(dateString);
    }
    if (serializedDateFormat === INPUT_FORMAT) {
      return datatypes.parse(dateString, datatype);
    }
    if (serializedDateFormat === JSON_SCHEMA_FORMAT) {
      return parseJsonSchemaDate(dateString, datatype);
    }
  };
  const getStringifiedValue = (originalValue, datatype) => {
    if (datatypeIsDateOrTime(datatype) && typeof originalValue === 'string') {
      const parsed = parseDateString(originalValue, datatype);
      if (!isNaN(parsed)) {
        originalValue = parsed;
      }
    }
    return datatypes.stringify(originalValue, datatype);
  };
  for (const [key, value] of Object.entries(dataObject)) {
    const fieldIdx = fields.findIndex((f) => f.name === key);
    if (fieldIdx < 0) {
      console.warn('Could not map data object key ' + key);
      continue;
    }
    const field = fields[fieldIdx];
    if (field.multivalued && Array.isArray(value)) {
      dataArray[fieldIdx] = formatMultivaluedValue(
        value.map((v) => getStringifiedValue(v, field.datatype))
      );
    } else {
      dataArray[fieldIdx] = getStringifiedValue(value, field.datatype);
    }
  }
  return dataArray;
}

/**
 * Parse a formatted string representing a multivalued value and return an
 * array of the individual values.
 *
 * @param {String} value String-formatted multivalued value.
 * @return {Array<String>} Array of individual string values.
 */
export function parseMultivaluedValue(value) {
  if (!value) {
    return [];
  }
  // trim the delimiter and the resulting tokens to be flexible about what
  // this function accepts
  return value
    .split(MULTIVALUED_DELIMITER.trim())
    .map((v) => v.trim())
    .filter((v) => !!v);
}

/**
 * Format a string array of multivalued values into a single string representation.
 *
 * @param {Array<Any>} values Array of individual values.
 * @return {String} String-formatted multivalued value.
 */
export function formatMultivaluedValue(values) {
  if (!values) {
    return '';
  }

  return values
    .filter((v) => !!v)
    .map((v) => (typeof v === 'string' ? v.trim() : String(v)))
    .join(MULTIVALUED_DELIMITER);
}
