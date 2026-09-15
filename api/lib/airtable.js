import { getConfig } from "./config.js";

const AIRTABLE_API = "https://api.airtable.com/v0";

async function airtableRequest(table, options = {}) {
  const config = getConfig();

  const {
    method = "GET",
    recordId = "",
    query = "",
    body,
  } = options;

  const encodedTable = encodeURIComponent(table);
  const encodedRecordId = recordId
    ? `/${encodeURIComponent(recordId)}`
    : "";

  const url =
    `${AIRTABLE_API}/${config.airtable.baseId}/${encodedTable}` +
    `${encodedRecordId}${query ? `?${query}` : ""}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${config.airtable.pat}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();

  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.error ||
      `Airtable request failed with status ${response.status}`;

    const error = new Error(message);
    error.status = response.status;
    error.airtable = data;
    throw error;
  }

  return data;
}

export async function airtableList(table, query = "") {
  const queryString =
    typeof query === "string"
      ? query
      : new URLSearchParams(query).toString();

  return airtableRequest(table, {
    method: "GET",
    query: queryString,
  });
}

export async function airtableGet(table, recordId) {
  return airtableRequest(table, {
    method: "GET",
    recordId,
  });
}

export async function airtableCreate(table, fields) {
  return airtableRequest(table, {
    method: "POST",
    body: { fields },
  });
}

export async function airtableUpdate(table, recordId, fields) {
  return airtableRequest(table, {
    method: "PATCH",
    recordId,
    body: { fields },
  });
}

export async function airtableDelete(table, recordId) {
  return airtableRequest(table, {
    method: "DELETE",
    recordId,
  });
}
