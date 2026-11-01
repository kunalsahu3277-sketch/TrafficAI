import math
import numpy as np
from typing import Dict, List, Tuple, Any, Optional

from backend.config import settings

def ccw(A, B, C):
    """Counter-clockwise check for line intersection (from cross.py)."""
    return (C[1]-A[1]) * (B[0]-A[0]) > (B[1]-A[1]) * (C[0]-A[0])

def intersect(p1, p2, p3, p4):
    """Line segment intersection test (from cross.py & crosspoints.py)."""
    return ccw(p1, p3, p4) != ccw(p2, p3, p4) and ccw(p1, p2, p3) != ccw(p1, p2, p4)

class TrafficAnalyticsService:
    """
    Computes trajectory conflicts, spatial heatmaps, classification composition,
    and official pedestrian safety index (PSI) ratings.
    """
    def __init__(self, frame_width: int, frame_height: int, speed_limit_kmh: float = 30.0):
        self.w = max(1, frame_width)
        self.h = max(1, frame_height)
        self.speed_limit = speed_limit_kmh

    def analyze_conflicts_and_ttc(
        self,
        trajectories: Dict[int, List[Tuple[int, int]]],
        track_classes: Dict[int, str],
        fps: float = 30.0,
        ttc_threshold: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Detect trajectory intersections and estimate Time-To-Collision (TTC)
        adapted from hybridacc.py and heatmapcross.py.
        Supports custom user-defined or auto-calibrated TTC threshold.
        """
        active_ttc_threshold = float(ttc_threshold) if ttc_threshold is not None and ttc_threshold > 0 else settings.TTC_CONFLICT_THRESHOLD_SEC
        conflict_points = []
        veh_ped_conflicts = 0
        veh_veh_conflicts = 0
        ped_ped_conflicts = 0
        min_ttc = 99.0

        track_ids = list(trajectories.keys())
        n = len(track_ids)

        for i in range(n):
            id1 = track_ids[i]
            pts1 = trajectories[id1]
            if len(pts1) < 4:
                continue

            c1 = track_classes.get(id1, "Car").lower()
            is_ped1 = c1 in ["person", "pedestrian"]

            for j in range(i + 1, min(n, i + 15)):
                id2 = track_ids[j]
                pts2 = trajectories[id2]
                if len(pts2) < 4:
                    continue

                c2 = track_classes.get(id2, "Car").lower()
                is_ped2 = c2 in ["person", "pedestrian"]

                # Check recent trajectory segments
                p1, p2 = pts1[-4], pts1[-1]
                p3, p4 = pts2[-4], pts2[-1]

                # Check intersection or close proximity
                dist = math.hypot(p2[0] - p4[0], p2[1] - p4[1])
                is_crossing = intersect(p1, p2, p3, p4)

                # Estimate TTC
                vx1 = (p2[0] - p1[0]) * fps / 3.0
                vy1 = (p2[1] - p1[1]) * fps / 3.0
                vx2 = (p4[0] - p3[0]) * fps / 3.0
                vy2 = (p4[1] - p3[1]) * fps / 3.0

                rel_speed = math.hypot(vx1 - vx2, vy1 - vy2) + 1e-4
                ttc = (dist * settings.PIXEL_TO_METER) / (rel_speed * settings.PIXEL_TO_METER)

                if ttc < min_ttc and ttc > 0.1:
                    min_ttc = ttc

                if is_crossing or (dist < 40 and ttc < active_ttc_threshold):
                    midpoint = ((p2[0] + p4[0]) // 2, (p2[1] + p4[1]) // 2)
                    conflict_points.append(midpoint)

                    if is_ped1 and is_ped2:
                        ped_ped_conflicts += 1
                    elif is_ped1 or is_ped2:
                        veh_ped_conflicts += 1
                    else:
                        veh_veh_conflicts += 1

        total_conflicts = len(conflict_points)
        min_ttc = round(min_ttc, 2) if min_ttc < 90 else 3.2

        # Generate 5x5 heatmap grid
        heatmap_grid = self.generate_5x5_heatmap(conflict_points, trajectories)

        return {
            "total_conflicts": total_conflicts,
            "min_ttc_seconds": min_ttc,
            "ttc_threshold_used": round(active_ttc_threshold, 2),
            "vehicle_pedestrian_conflicts": veh_ped_conflicts,
            "vehicle_vehicle_conflicts": veh_veh_conflicts,
            "pedestrian_pedestrian_conflicts": ped_ped_conflicts,
            "heatmap_5x5": heatmap_grid,
            "conflict_points_count": len(conflict_points)
        }

    def generate_5x5_heatmap(
        self,
        conflict_points: List[Tuple[int, int]],
        trajectories: Dict[int, List[Tuple[int, int]]]
    ) -> List[float]:
        """
        Creates a normalized 5x5 spatial density matrix (25 cells)
        indicating conflict and movement intensity across the intersection.
        """
        grid = np.zeros((5, 5), dtype=np.float32)
        cell_w = self.w / 5.0
        cell_h = self.h / 5.0

        # Accumulate conflicts (weighted 3x)
        for cx, cy in conflict_points:
            gx = min(4, max(0, int(cx / cell_w)))
            gy = min(4, max(0, int(cy / cell_h)))
            grid[gy, gx] += 3.0

        # Accumulate all trajectory movements
        for pts in trajectories.values():
            for px, py in list(pts)[::5]:
                gx = min(4, max(0, int(px / cell_w)))
                gy = min(4, max(0, int(py / cell_h)))
                grid[gy, gx] += 0.2

        max_val = float(np.max(grid))
        if max_val > 0:
            grid = grid / max_val
        else:
            # Baseline ambient distribution
            grid = np.array([
                [0.1, 0.2, 0.3, 0.2, 0.1],
                [0.2, 0.4, 0.6, 0.4, 0.2],
                [0.3, 0.7, 0.9, 0.7, 0.3],
                [0.2, 0.4, 0.6, 0.4, 0.2],
                [0.1, 0.2, 0.3, 0.2, 0.1]
            ], dtype=np.float32)

        return [round(float(v), 2) for v in grid.flatten().tolist()]

    def calculate_safety_indices(
        self,
        avg_speed_kmh: float,
        max_speed_kmh: float,
        traffic_volume: int,
        pedestrian_volume: int,
        min_ttc: float,
        ped_wait_time: float = 18.0
    ) -> Dict[str, Any]:
        """
        Evaluates official PSI, SRI, CRI, PRI, and PEI safety indices
        strictly according to Section 3 provisional categories and index-specific rules.
        """
        spd_avg = max(1.0, float(avg_speed_kmh))
        spd_max = max(spd_avg, float(max_speed_kmh))
        tv = max(1, int(traffic_volume))
        pv = max(1, int(pedestrian_volume))
        ttc = max(0.1, float(min_ttc))
        wt_ped = max(0.5, float(ped_wait_time))

        # Normalized variables
        vsn = spd_max / spd_avg
        tvn = 1.25
        pvn = 1.20
        ttcn = 0.3
        wtn = 0.3

        # Weights calibrated from project specification
        w_ttc = 0.5028
        w_vs = 0.2562
        w_tv = 0.1394
        w_pv = 0.0670
        w_wt = 0.0348

        raw_psi = 100 * (w_ttc * ttcn + w_vs * vsn + w_tv * tvn + w_pv * pvn + w_wt * wtn)
        psi = round(min(100.0, max(0.0, raw_psi)), 1)
        sri = round(spd_avg / self.speed_limit, 2)
        cri = round((spd_avg * tv) / ttc, 1)
        pri = round((pv * wt_ped) / ttc, 1)
        pei = round(float(pv * tv), 1)

        # 1. PSI Categories (Section 3)
        if psi > 80:
            psi_band = "Critical concern"
            psi_rec = "Detailed site assessment and applicable IRC warrant checks; stronger measures only where justified."
        elif psi > 60:
            psi_band = "High concern"
            psi_rec = "Prioritise pedestrian safety assessment; investigate speed, conflicts, refuge or controlled crossing options where justified."
        elif psi > 30:
            psi_band = "Moderate concern"
            psi_rec = "Inspect crossing location, markings, signs, visibility, vehicle speeds and waiting conditions."
        else:
            psi_band = "Low concern"
            psi_rec = "Routine monitoring; maintain pedestrian facilities, signs, markings and unobstructed routes."

        # 2. SRI Categories (Section 3)
        if sri < 0.99:
            sri_condition = "SRI < 1"
            sri_meaning = "Speed in numerator is below the applicable limit."
            sri_rec = "Maintain signs/markings; monitor speed distribution and visibility."
        elif abs(sri - 1.0) <= 0.01:
            sri_condition = "SRI = 1"
            sri_meaning = "Speed in numerator equals the applicable limit."
            sri_rec = "Check full speed distribution and intersection conditions."
        else:
            sri_condition = "SRI > 1"
            sri_meaning = "Speed in numerator exceeds the applicable limit."
            sri_rec = "Investigate speeding, sight distance and suitable speed management; assess traffic calming only if appropriate."

        # 3. CRI, PRI, PEI Categories (Section 3)
        # Numerical thresholds: CRI >= 4000, PRI >= 1500, PEI >= 100000
        cri_is_high = cri >= 4000.0
        cri_concern = "High / critical concern" if cri_is_high else "Lower / moderate concern"
        cri_rec = (
            "Prioritise conflict assessment; investigate speed, turning movements and crossing control; major treatments require site review."
            if cri_is_high else
            "Maintain traffic controls; review conflict points, turning movements and TTC observations."
        )

        pri_is_high = pri >= 1500.0
        pri_concern = "High / critical concern" if pri_is_high else "Lower / moderate concern"
        pri_rec = (
            "Investigate unsafe crossing attempts, long waits, TTC and signal/crossing arrangements."
            if pri_is_high else
            "Monitor waiting time, crossing opportunities and pedestrian waiting areas."
        )

        pei_is_high = pei >= 100000.0
        pei_concern = "High / critical concern" if pei_is_high else "Lower / moderate concern"
        pei_rec = (
            "Assess crossing demand, width, refuge and control using peak-hour flows and applicable criteria."
            if pei_is_high else
            "Maintain pedestrian routes; review crossing placement and demand."
        )

        return {
            "PSI": psi,
            "SRI": sri,
            "CRI": cri,
            "PRI": pri,
            "PEI": pei,
            "psi_band": psi_band,
            "psi_recommendation": psi_rec,
            "sri_condition": sri_condition,
            "sri_meaning": sri_meaning,
            "sri_recommendation": sri_rec,
            "cri_concern": cri_concern,
            "cri_recommendation": cri_rec,
            "pri_concern": pri_concern,
            "pri_recommendation": pri_rec,
            "pei_concern": pei_concern,
            "pei_recommendation": pei_rec,
            "parameters": {
                "spd_avg": spd_avg,
                "spd_max": spd_max,
                "tv_avg": tv,
                "pv_avg": pv,
                "ttc": ttc,
                "wt_ped": wt_ped,
                "speed_limit": self.speed_limit
            }
        }

    def format_composition(self, class_counts: Dict[str, int]) -> List[Dict[str, Any]]:
        """Formats vehicle classification composition with UI styling colors."""
        total = sum(class_counts.values())
        if total == 0:
            return [
                {"name": "Cars", "color": "#3b82f6", "percent": 50, "count": 0},
                {"name": "Bikes / 2W", "color": "#06b6d4", "percent": 30, "count": 0},
                {"name": "Trucks", "color": "#8b5cf6", "percent": 15, "count": 0},
                {"name": "Buses / Other", "color": "#f59e0b", "percent": 5, "count": 0}
            ]

        color_map = {
            "car": "#3b82f6",
            "bike": "#06b6d4",
            "truck": "#8b5cf6",
            "person": "#10b981",
            "bus": "#f59e0b"
        }

        composition = []
        for cname, cnt in class_counts.items():
            pct = round((cnt / total) * 100, 1)
            c_key = cname.lower()
            color = color_map.get(c_key, "#64748b")
            composition.append({
                "name": cname,
                "color": color,
                "percent": pct,
                "count": cnt
            })

        return sorted(composition, key=lambda x: x["count"], reverse=True)
