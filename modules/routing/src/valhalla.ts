/**
 * Valhalla HTTP adapter implementing RoutingEngine.
 * Maps Valhalla's /route response to the frozen RouteResult contract.
 * Engine maneuver types are mapped to the closed ManeuverType enum (ADR-0006).
 */
import {
  type BBox,
  type Maneuver,
  ManeuverModifier,
  ManeuverType,
  type RouteRequest,
  RouteResult,
  type RoutingEngine,
} from '@iraq-maps/contracts';

/** Valhalla costing model per TravelMode */
const COSTING: Record<string, string> = { car: 'auto', walk: 'pedestrian' };

/** Map Valhalla numeric type → ManeuverType. Based on Valhalla OSRM-compatible docs. */
function mapManeuverType(valhallaType: number): ManeuverType {
  switch (valhallaType) {
    case 1:
      return 'depart';
    case 4:
      return 'arrive';
    case 2:
    case 10:
      return 'continue';
    case 3:
    case 5:
    case 6:
    case 7:
      return 'turn';
    case 21:
      return 'uturn';
    case 11:
    case 12:
      return 'ramp';
    case 13:
    case 14:
      return 'exit';
    case 15:
    case 16:
      return 'fork';
    case 19:
    case 20:
      return 'merge';
    case 22:
    case 23:
      return 'roundabout_enter';
    case 24:
    case 25:
      return 'roundabout_exit';
    case 26:
    case 27:
      return 'ferry_enter';
    case 28:
    case 29:
      return 'ferry_exit';
    default:
      return 'continue';
  }
}

/** Map Valhalla modifier string → ManeuverModifier (optional). */
function mapModifier(mod: string | undefined): ManeuverModifier | undefined {
  if (!mod) return undefined;
  const lower = mod.toLowerCase().replace(/\s+/g, '_');
  const parsed = ManeuverModifier.safeParse(lower);
  return parsed.success ? parsed.data : undefined;
}

interface ValhallaManeuver {
  type: number;
  instruction?: string;
  street_names?: string[];
  length: number;
  time: number;
  begin_shape_index: number;
  roundabout_exit_count?: number;
  modifier?: string;
}

interface ValhallaLeg {
  shape: string;
  maneuvers: ValhallaManeuver[];
  summary: { length: number; time: number };
}

interface ValhallaTrip {
  legs: ValhallaLeg[];
  summary: { length: number; time: number; min_lat: number; min_lon: number; max_lat: number; max_lon: number };
  status: number;
}

interface ValhallaResponse {
  trip: ValhallaTrip;
}

export class ValhallaClient implements RoutingEngine {
  readonly kind = 'valhalla' as const;

  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 5000,
  ) {}

  async route(request: RouteRequest): Promise<RouteResult | null> {
    const locations = [request.origin, ...request.waypoints, request.destination].map(([lon, lat]) => ({ lon, lat }));
    const body = JSON.stringify({
      locations,
      costing: COSTING[request.mode] ?? 'auto',
      directions_options: { language: 'en-US' },
    });

    let resp: Response;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        resp = await fetch(`${this.baseUrl}/route`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      throw new Error(`Routing engine unreachable: ${(err as Error).message}`, { cause: err });
    }

    if (resp.status === 400) {
      // Valhalla 400: no route found, or coordinates outside tiles
      return null;
    }
    if (!resp.ok) {
      throw new Error(`Routing engine error: HTTP ${resp.status}`);
    }

    const data: ValhallaResponse = (await resp.json()) as ValhallaResponse;
    return this.mapResponse(data);
  }

  private mapResponse(data: ValhallaResponse): RouteResult {
    const trip = data.trip;
    // Valhalla may return multiple legs (via waypoints); combine into one shape + maneuver list.
    const allManeuvers: Maneuver[] = [];
    // MVP: only the first leg is used. Waypoints are an extension for later phases.
    const firstLeg = trip.legs[0];
    if (!firstLeg) throw new Error('Valhalla returned no legs');

    const polyline6 = firstLeg.shape;

    for (const m of firstLeg.maneuvers) {
      const type = ManeuverType.parse(mapManeuverType(m.type));
      const maneuver: Maneuver = {
        type,
        modifier: mapModifier(m.modifier),
        streetNames: (m.street_names ?? []).slice(0, 5),
        distanceM: Math.round(m.length * 1000), // km → m
        durationS: Math.round(m.time),
        beginShapeIndex: m.begin_shape_index,
      };
      if (type === 'roundabout_enter' && m.roundabout_exit_count != null) {
        maneuver.roundaboutExit = m.roundabout_exit_count;
      }
      allManeuvers.push(maneuver);
    }

    const s = trip.summary;
    const bbox: BBox = [s.min_lon, s.min_lat, s.max_lon, s.max_lat];

    return RouteResult.parse({
      polyline6,
      distanceM: Math.round(s.length * 1000),
      durationS: Math.round(s.time),
      bbox,
      maneuvers: allManeuvers,
    });
  }
}
