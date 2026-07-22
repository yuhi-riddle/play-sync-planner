import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

import {
  assertExactCleanupIds,
  chunkRows,
  createJsonArtifact,
  MAX_WRITE_BATCH_SIZE as SAFETY_MAX_WRITE_BATCH_SIZE,
  performanceLabel,
  readJsonArtifact,
  requirePerfValue,
  safePerformanceConfig,
  writeJsonArtifact
} from "./safety.mjs";

export const MAX_WRITE_BATCH_SIZE = SAFETY_MAX_WRITE_BATCH_SIZE;
export const DATASET_TARGETS = Object.freeze({
  ownedEvents: 10_000,
  connectionCandidates: 5_000,
  scheduleRows: 10_000,
  messages: 10_000
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID_GROUPS = ["users", "profiles", "events", "plans", "candidateDates", "eventMembers", "messages"];

function manifestName(runId) {
  return `seed-${runId}.json`;
}

function emptyManifest(config) {
  return {
    schemaVersion: 1,
    runId: config.runId,
    targetRef: config.projectRef,
    label: performanceLabel(config.runId, "dataset"),
    createdAt: new Date().toISOString(),
    complete: false,
    ids: Object.fromEntries(ID_GROUPS.map((name) => [name, []]))
  };
}

function exactUuid(name, value) {
  if (!UUID_PATTERN.test(value)) throw new Error(`${name} must be an exact UUID.`);
  return value;
}

async function persistManifest(manifest) {
  await writeJsonArtifact(manifestName(manifest.runId), manifest);
}

async function insertBatches(client, table, rows, manifest, idGroup) {
  for (const batch of chunkRows(rows)) {
    const { error } = await client.from(table).insert(batch);
    if (error) throw new Error(`Performance insert failed for ${table}.`);
    manifest.ids[idGroup].push(...batch.map((row) => row.id ?? row.user_id));
    await persistManifest(manifest);
  }
}

async function mapInGroups(values, size, operation) {
  const results = [];
  for (const group of chunkRows(values, size)) {
    results.push(...await Promise.all(group.map(operation)));
  }
  return results;
}

async function createCandidateUsers(client, config, manifest) {
  const indexes = Array.from({ length: DATASET_TARGETS.connectionCandidates }, (_, index) => index);
  const label = performanceLabel(config.runId, "connection candidate");
  for (const group of chunkRows(indexes, 25)) {
    const outcomes = await Promise.allSettled(group.map(async (index) => {
      const { data, error } = await client.auth.admin.createUser({
        email: `perf-${config.runId}-${index}-${randomUUID()}@example.invalid`,
        password: `${randomUUID()}-${randomUUID()}`,
        email_confirm: true,
        user_metadata: { display_name: `${label} ${index}` },
        app_metadata: { performance_run_id: config.runId }
      });
      if (error || !data.user?.id) throw new Error("Performance test user creation failed.");
      return exactUuid("generated user id", data.user.id);
    }));
    const createdIds = outcomes.flatMap((outcome) => outcome.status === "fulfilled" ? [outcome.value] : []);
    manifest.ids.users.push(...createdIds);
    await persistManifest(manifest);
    if (outcomes.some((outcome) => outcome.status === "rejected")) {
      throw new Error("Performance test user creation failed.");
    }
  }
  return manifest.ids.users;
}

function buildEvents(ownerUserId, runId) {
  return Array.from({ length: DATASET_TARGETS.ownedEvents }, (_, index) => ({
    id: randomUUID(),
    owner_user_id: ownerUserId,
    category: "other",
    title: performanceLabel(runId, `event ${index}`),
    status: "planning"
  }));
}

function buildSchedules(events, ownerUserId, runId, month) {
  const planCount = DATASET_TARGETS.scheduleRows / 2;
  const plans = Array.from({ length: planCount }, (_, index) => ({
    id: randomUUID(),
    event_id: events[index].id,
    owner_user_id: ownerUserId,
    title: performanceLabel(runId, `plan ${index}`),
    status: "collecting_answers"
  }));
  const monthStart = new Date(`${month}T00:00:00.000Z`);
  const candidateDates = plans.map((plan, index) => {
    const startAt = new Date(monthStart);
    startAt.setUTCMonth(startAt.getUTCMonth() + Math.floor(index / 5));
    startAt.setUTCDate(10 + (index % 5));
    const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
    return {
      id: randomUUID(),
      plan_id: plan.id,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      memo: performanceLabel(runId, `candidate ${index}`),
      sort_order: index % 5
    };
  });
  return { plans, candidateDates };
}

async function seed(client, config, env) {
  const ownerUserId = exactUuid("PERF_OWNER_USER_ID", requirePerfValue(env, "PERF_OWNER_USER_ID"));
  const month = requirePerfValue(env, "PERF_MONTH");
  if (!/^\d{4}-(?:0[1-9]|1[0-2])-01$/.test(month)) {
    throw new Error("PERF_MONTH must be the first day of a month.");
  }

  const manifest = emptyManifest(config);
  await createJsonArtifact(manifestName(config.runId), manifest);

  const candidateUserIds = await createCandidateUsers(client, config, manifest);
  const profiles = candidateUserIds.map((userId, index) => ({
    user_id: userId,
    nickname: performanceLabel(config.runId, `candidate ${index}`)
  }));
  for (const batch of chunkRows(profiles)) {
    const { error } = await client.from("profiles").upsert(batch, { onConflict: "user_id" });
    if (error) throw new Error("Performance profile insert failed.");
    manifest.ids.profiles.push(...batch.map((row) => row.user_id));
    await persistManifest(manifest);
  }

  const events = buildEvents(ownerUserId, config.runId);
  await insertBatches(client, "events", events, manifest, "events");

  const ownerMemberships = events.map((event) => ({
    id: randomUUID(),
    event_id: event.id,
    user_id: ownerUserId,
    display_name: performanceLabel(config.runId, "owner"),
    role: "organizer",
    status: "joined"
  }));
  const sharedEventId = events[0].id;
  const candidateMemberships = candidateUserIds.map((userId, index) => ({
    id: randomUUID(),
    event_id: sharedEventId,
    user_id: userId,
    display_name: performanceLabel(config.runId, `candidate ${index}`),
    role: "member",
    status: "joined"
  }));
  await insertBatches(client, "event_members", [...ownerMemberships, ...candidateMemberships], manifest, "eventMembers");

  const { plans, candidateDates } = buildSchedules(events, ownerUserId, config.runId, month);
  await insertBatches(client, "plans", plans, manifest, "plans");
  await insertBatches(client, "candidate_dates", candidateDates, manifest, "candidateDates");

  const messages = Array.from({ length: DATASET_TARGETS.messages }, (_, index) => ({
    id: randomUUID(),
    event_id: sharedEventId,
    author_user_id: ownerUserId,
    body: performanceLabel(config.runId, `message ${index}`)
  }));
  await insertBatches(client, "event_messages", messages, manifest, "messages");

  manifest.complete = true;
  manifest.completedAt = new Date().toISOString();
  await persistManifest(manifest);
}

async function deleteExactRows(client, table, column, ids) {
  for (const batch of chunkRows(ids)) {
    if (batch.length === 0) continue;
    const { error } = await client.from(table).delete().in(column, batch);
    if (error) throw new Error(`Performance cleanup failed for ${table}.`);
  }
}

async function cleanup(client, config) {
  const manifest = await readJsonArtifact(manifestName(config.runId));
  const exactIds = Object.fromEntries(ID_GROUPS.map((name) => [
    name,
    assertExactCleanupIds({
      runId: config.runId,
      manifestRunId: manifest.runId,
      targetRef: config.projectRef,
      manifestTargetRef: manifest.targetRef,
      ids: manifest.ids?.[name]
    })
  ]));

  await deleteExactRows(client, "event_messages", "id", exactIds.messages);
  await deleteExactRows(client, "candidate_dates", "id", exactIds.candidateDates);
  await deleteExactRows(client, "plans", "id", exactIds.plans);
  await deleteExactRows(client, "event_members", "id", exactIds.eventMembers);
  await deleteExactRows(client, "events", "id", exactIds.events);
  await deleteExactRows(client, "profiles", "user_id", exactIds.profiles);
  await mapInGroups(exactIds.users, 25, async (userId) => {
    const { error } = await client.auth.admin.deleteUser(userId);
    if (error && error.status !== 404) throw new Error("Performance test user cleanup failed.");
  });

  manifest.cleanedAt = new Date().toISOString();
  manifest.cleaned = true;
  await persistManifest(manifest);
}

export async function runLargeDataset({ env = process.env, write = console.error } = {}) {
  try {
    const config = safePerformanceConfig(env);
    const command = requirePerfValue(env, "PERF_COMMAND");
    if (!new Set(["seed", "cleanup"]).has(command)) {
      throw new Error("PERF_COMMAND must be seed or cleanup.");
    }
    const serviceRoleKey = requirePerfValue(env, "PERF_SUPABASE_SERVICE_ROLE_KEY");
    const client = createClient(config.baseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
    });

    if (command === "seed") await seed(client, config, env);
    else await cleanup(client, config);
    write(command === "seed" ? "Performance dataset seed completed." : "Performance dataset cleanup completed.");
    return 0;
  } catch {
    write("Performance dataset operation failed.");
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runLargeDataset().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
