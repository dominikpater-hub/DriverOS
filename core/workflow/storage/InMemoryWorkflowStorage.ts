/**
 * IN-MEMORY WORKFLOW STORAGE
 *
 * Mock implementation of IWorkflowStorage for tests and local development.
 * Extracted from duplicated inline copies in bootstrap-local.ts and
 * WorkflowEngine.test.ts — see BUILD_STATUS.md.
 */

import { InstanceId, WorkflowDefId, IncidentId } from "../../../shared/types";

export class InMemoryWorkflowStorage {
  private instances = new Map<string, any>();
  private definitions = new Map<string, any>();
  private incidents = new Map<string, any>();

  seedDefinition(def: any): void {
    this.definitions.set(def.id, def);
  }

  async getInstance(id: InstanceId): Promise<any | null> {
    return this.instances.get(id) ?? null;
  }

  async getDefinition(id: WorkflowDefId): Promise<any | null> {
    return this.definitions.get(id) ?? null;
  }

  async saveInstance(instance: any): Promise<void> {
    this.instances.set(instance.id, instance);
  }

  async saveIncident(incident: any): Promise<void> {
    this.incidents.set(incident.id, incident);
  }

  async getIncident(id: IncidentId): Promise<any | null> {
    return this.incidents.get(id) ?? null;
  }
}
