import type { SkyPosition } from "./coordinates";
import type { SkyObject } from "./objects";
import type { SkyMapTimeState } from "./time";

export interface SkyObjectResolvedState<TObject extends SkyObject = SkyObject> {
  object: TObject;
  position: SkyPosition;
  resolvedAtIso: string;
  note?: string;
}

export interface SkyLayerTimeResolver<TObject extends SkyObject = SkyObject> {
  id: string;
  resolveObjects: (objects: TObject[], time: SkyMapTimeState) => TObject[];
  resolveObjectState?: (object: TObject, time: SkyMapTimeState) => SkyObjectResolvedState<TObject>;
}

export const staticSkyLayerTimeResolver: SkyLayerTimeResolver = {
  id: "static",
  resolveObjects: (objects) => objects,
  resolveObjectState: (object, time) => ({
    object,
    position: object.position,
    resolvedAtIso: time.currentTimeIso,
    note: "Static layer state does not change with SkyMap simulation time.",
  }),
};
