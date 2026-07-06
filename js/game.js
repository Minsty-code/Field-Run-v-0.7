//====================
//Variables
//====================

//Tableau d'historique de position
        let coords = [];
//En train de jouer ?
        let isRunning = false;
//Watch Position
        let watchId;
//Première initialisation
        let firstMapFix = true;
//Premier point GPS
        let firstPoint = null;
//Première initialisation tracage
        let firstTracingFix = true;
//Centrage carte
        let isCentred = true;
//Dernière position
        let lastPosition = null;
//Zones
//Chaque zone est un objet { id, owner, points, layer } au lieu d'un simple
//tableau de points, pour pouvoir distinguer "mes zones" des "zones ennemies"
//une fois le multijoueur branché.
        let zones = [];
//Surface totale capturée par le joueur (m²)
        let playerTotalArea = 0;
//Score du joueur en points (1 point = 1 m²)
//Séparé de playerTotalArea pour pouvoir plus tard ajouter des bonus/malus
//(ex: capturer une zone ennemie) sans casser la correspondance surface réelle.
        let playerScore = 0;
//Zooms
        const GAME_ZOOM = 19;
        const IDLE_ZOOM = 15;


//====================
//Fonctions
//====================
  
    //Démarre la récupération GPS
    function startGPS() {
        if ("geolocation" in navigator) {                              
//watchPosition = surveille la position en continu
            watchId = navigator.geolocation.watchPosition( //-----------------------------WATCH POSITION
                onPositionUpdate,
                handleError,
                
                { enableHighAccuracy: true, maximumAge: 0, timeout: 75000 }
            );
            
        } else {
                
                alert("GPS non disponible sur ce navigateur");
        }
    }

    //Arrête la récupération GPS
    function stopGPS() {
        if (watchId) {
            navigator.geolocation.clearWatch(watchId);
        }
    }


//Fonction appelée à chaque mise à jour GPS
    function onPositionUpdate(position) {

//Récupère les coordonnées
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
//Récupère la précision en mètres
        const accuracy = position.coords.accuracy;

        const currentPoint = [lat, lon];

        updateAccuracyCircle(lat, lon, accuracy);

        lastPosition = currentPoint;

        updateMarker(lat, lon);
        
        if (isCentred) {
            map.panTo([lat, lon],);
        }
        if (lastPosition) {
                map.setView(lastPosition, isRunning ? GAME_ZOOM : IDLE_ZOOM);
        }

        
        // Si on est en train de tracer
        if (isRunning) {
            //Ignore les mouvements trop faibles pour éviter le "clignotement"
            if (coords.length > 0) {
                const lastPoint = coords[coords.length - 1];
                const moveDistance = distance(lastPoint, currentPoint);

                    if (moveDistance < 1) {
                        // Même si on bouge peu, on vérifie quand même la fermeture
                        // (cas : retour lent vers le point de départ)
                        checkCloseZone(currentPoint);
                        return;
                    }       
            }

            //Ajoute le point au tracé
            coords.push(currentPoint);
            updateLine(coords);

            //Définit le point de départ si c'est le premier point du tracé
            if (firstTracingFix) {
                firstPoint = [...currentPoint]; // copie propre, pas une référence
                firstTracingFix = false;
            }

            //Vérifie si on peut fermer la zone
            checkCloseZone(currentPoint);
        }
        
        if(map) {
            if (firstMapFix) {
                map.setView([lat, lon], isRunning ? GAME_ZOOM : IDLE_ZOOM);// centre + zoom fort
                addDemoEnemyZone(lat, lon);
                firstMapFix = false;
                hideLoader();
            }
        }

    }

//Fonction pour calculer la distance entre deux points GPS (en m)
    function distance(point1, point2) {
        const lat1 = point1[0];
        const lon1 = point1[1];
        const lat2 = point2[0];
        const lon2 = point2[1];

        const R = 6371000; //rayon de la Terre (m)

        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;

        const formuleHaversine =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) *
            Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);

        const angleCentral = 2 * Math.atan2(
            Math.sqrt(formuleHaversine),
            Math.sqrt(1 - formuleHaversine)
        );

        return R * angleCentral; //distance en mètres
    }

//Test d'intersection
    function checkIntersection(currentPoint) {
        if (coords.length < 4) {
            return null; //pas assez de segment pour croiser
        }
            const newSegmentStart = coords [coords.length - 1];
            const newSegmentEnd = currentPoint;

            for (let i = 0; i < coords.length - 3; i++) {
                
                const segStart = coords[i];
                const segEnd = coords[i+1];

                const intersection = segmentIntersection(
                    segStart, 
                    segEnd, 
                    newSegmentStart, 
                    newSegmentEnd
                );
                    
                if (intersection) {
                    return intersection;
                }
            }
        
            return null; //pas d'intersection
    }

//segments d'intersection
    function segmentIntersection(p1, p2, q1, q2) { // p1 & p2 : segment existant § q1 & q2 : nouveau segment
        //vecteurs et paramétrisation de la ligne
        const s1x = p2[0] - p1[0];
        const s1y = p2[1] - p1[1];
        const s2x = q2[0] - q1[0];
        const s2y = q2[1] - q1[1];

        const denom = (-s2x * s1y + s1x * s2y);

        // segments parallèles → pas d'intersection
        if (Math.abs(denom) < 0.0000001) {
            return null;
        }
        const s = (-s1y * (p1[0] - q1[0]) + s1x * (p1[1] - q1[1])) / denom;
        const t = ( s2x * (p1[1] - q1[1]) - s2y * (p1[0] - q1[0])) / denom;

        if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
            //intersetion trouvée
            return [p1[0] + (t * s1x), p1[1] + (t * s1y)];
        }

        return null; //pas d'intersection
    }
//Fonction pour vérifier si on peut fermer la zone
    function checkCloseZone(currentPoint) {

        if (coords.length < 1) return null;
        
        // Cas 1 : retour proche du point de départ
        if (firstPoint && distance(firstPoint, currentPoint) < 3 && coords.length > 5) {
            closeZone(coords);
            return;
        }
        //Cas 2 : intersection avec une ligne récédente
        const intersection = checkIntersection(currentPoint);
        if (intersection) {
            coords.push(intersection);
            closeZone(coords);
            return;
        }
        //Cas 3 : intersection avec une zone
        const zoneIntersection = checkZoneIntersection(currentPoint);
        if (zoneIntersection) {
            coords.push(zoneIntersection);
            closeZone(coords);
            return;
        }
    }

//Fonction pour savoir si y'a une intersection avec une zone
    function checkZoneIntersection(currentPoint) {
        const newStart = coords[coords.length - 1];
        const newEnd = currentPoint;

        for (let i = 0; i < zones.length; i++) {
            const zonePoints = zones[i].points;
            for (let j = 0; j < zonePoints.length; j++) {
                const segStart = zonePoints[j];
                const segEnd = zonePoints[(j + 1) % zonePoints.length];
                const intersection = segmentIntersection(segStart, segEnd, newStart, newEnd);
                if (intersection) return intersection;
            }
        }
        return null;
    }
        
//Fonction pour calculer la surface d'un polygone GPS (en m²)
//Formule d'aire sphérique exacte : on décompose le polygone en triangles
//polaires (chaque arête + le pôle Nord) et on somme leurs aires signées.
//Contrairement à une projection plate, ça calcule l'aire directement sur
//la sphère, donc pas d'erreur liée à la courbure de la Terre.
    function polarTriangleArea(tan1, lng1, tan2, lng2) {
        const deltaLng = lng1 - lng2;
        const t = tan1 * tan2;
        return 2 * Math.atan2(t * Math.sin(deltaLng), 1 + t * Math.cos(deltaLng));
    }

    function calculatePolygonArea(points) {
        if (points.length < 3) return 0;

        const R = 6371000; // rayon de la Terre (m)
        let total = 0;

        const prev = points[points.length - 1];
        let prevTanLat = Math.tan((Math.PI / 2 - prev[0] * Math.PI / 180) / 2);
        let prevLng = prev[1] * Math.PI / 180;

        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            const tanLat = Math.tan((Math.PI / 2 - point[0] * Math.PI / 180) / 2);
            const lng = point[1] * Math.PI / 180;

            total += polarTriangleArea(tanLat, lng, prevTanLat, prevLng);

            prevTanLat = tanLat;
            prevLng = lng;
        }

        return Math.abs(total) * R * R; // en m²
    }

//Fonction pour fermer la zone et l'afficher
    function closeZone(points) {

        stopTracking();

        const area = calculatePolygonArea(points);
        playerTotalArea += area;
        playerScore += Math.round(area); // 1 point = 1 m²

        //Découpe les zones ennemies traversées par la boucle qu'on vient de fermer
        performEnemyCapture(points);

        const layer = L.polygon(points, {
            color: "#2800A8",
            fillOpacity: 0.4,
        }).addTo(map);

        zones.push({ id: `player_${Date.now()}`, owner: "player", points, layer });

        updateAreaDisplay(playerTotalArea);
        updateScoreDisplay(playerScore);

        //Sauvegarde en ligne pour que les autres joueurs la voient
        saveZoneToSupabase(points, area);
    }

//====================
//Capture de zone ennemie (via Turf.js)
//====================
//NOTE : tant qu'il n'y a pas de backend/multijoueur, il n'existe pas de
//vrai "ennemi". La fonction addDemoEnemyZone() plus bas crée une zone de
//test au démarrage pour pouvoir vérifier que la découpe fonctionne. Le
//jour où les zones des autres joueurs arrivent du serveur, il suffira de
//les pousser dans `zones` avec owner = l'id du joueur adverse — le reste
//du code fonctionnera sans changement.

//Convertit nos points [lat, lon] en anneau Turf/GeoJSON [lon, lat] fermé
    function toTurfRing(points) {
        const ring = points.map(p => [p[1], p[0]]);
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) {
            ring.push([first[0], first[1]]);
        }
        return ring;
    }

//Convertit un anneau Turf/GeoJSON [lon, lat] en points [lat, lon] pour Leaflet
    function toLatLngPoints(ring) {
        return ring.map(c => [c[1], c[0]]);
    }

//Découpe toutes les zones ennemies qui chevauchent la zone que le joueur vient de fermer
    function performEnemyCapture(newZonePoints) {
        let newZonePoly;
        try {
            newZonePoly = turf.polygon([toTurfRing(newZonePoints)]);
        } catch (e) {
            console.warn("Zone du joueur invalide pour le calcul de capture :", e);
            return;
        }

        // On parcourt à l'envers car on peut retirer/remplacer des éléments du tableau
        for (let i = zones.length - 1; i >= 0; i--) {
            const zone = zones[i];
            if (zone.owner === "player") continue; // on ne découpe pas ses propres zones ici

            let enemyPoly;
            try {
                enemyPoly = turf.polygon([toTurfRing(zone.points)]);
            } catch (e) {
                continue; // zone ennemie mal formée, on l'ignore
            }

            let overlaps = false;
            try {
                overlaps =
                    turf.booleanOverlap(enemyPoly, newZonePoly) ||
                    turf.booleanContains(newZonePoly, enemyPoly) ||
                    turf.booleanContains(enemyPoly, newZonePoly);
            } catch (e) {
                overlaps = false;
            }

            if (!overlaps) continue;

            // Surface que l'ennemi perd (utile plus tard pour son score serveur)
            let lostArea = 0;
            try {
                const inter = turf.intersect(enemyPoly, newZonePoly);
                if (inter) lostArea = turf.area(inter);
            } catch (e) { /* pas d'intersection propre, on ignore */ }

            // Ce qu'il reste du territoire ennemi = ennemi - zone du joueur
            let remainder = null;
            try {
                remainder = turf.difference(enemyPoly, newZonePoly);
            } catch (e) {
                remainder = null;
            }

            // On retire l'ancienne zone ennemie (elle va être remplacée par ce qu'il en reste, ou par rien)
            if (zone.layer) map.removeLayer(zone.layer);
            zones.splice(i, 1);

            if (lostArea > 0) {
                console.log(`Zone ennemie capturée : ~${Math.round(lostArea)} m²`);
            }

            if (!remainder) continue; // zone ennemie entièrement capturée, rien à redessiner

            // Le reste peut être un seul polygone ou plusieurs (si la découpe le coupe en deux morceaux)
            const polygonsCoords =
                remainder.geometry.type === "MultiPolygon"
                    ? remainder.geometry.coordinates
                    : [remainder.geometry.coordinates];

            polygonsCoords.forEach(coordsSet => {
                const ring = coordsSet[0]; // on ignore les trous internes pour rester simple pour l'instant
                const latLngPoints = toLatLngPoints(ring);
                if (latLngPoints.length < 3) return;

                const remainderLayer = L.polygon(latLngPoints, {
                    color: "#D80032",
                    fillOpacity: 0.4,
                }).addTo(map);

                zones.push({
                    id: zone.id,
                    owner: zone.owner,
                    points: latLngPoints,
                    layer: remainderLayer,
                });
            });
        }
    }

//Crée une zone ennemie de test au démarrage, pour valider la capture
//tant que le multijoueur n'existe pas. À supprimer une fois le backend branché.
    function addDemoEnemyZone(lat, lon) {
        const offset = 0.00025; // ~25m
        const squarePoints = [
            [lat + offset, lon + offset],
            [lat + offset, lon + offset * 2.4],
            [lat + offset * 2.2, lon + offset * 2.4],
            [lat + offset * 2.2, lon + offset],
        ];

        const layer = L.polygon(squarePoints, {
            color: "#D80032",
            fillOpacity: 0.4,
        }).addTo(map);

        zones.push({ id: "demo_enemy_1", owner: "demo_enemy", points: squarePoints, layer });
    }

//Démarrer le suivi
    function startTracking() {
        if (!lastPosition) {
            alert("GPS en cours d'initialisation");
        return;
        }
        isRunning = true;
        if (lastPosition) {
            map.setView(lastPosition, GAME_ZOOM);
    }
        firstTracingFix = true;
        firstPoint = null;
        updateButtonsUI (true);
        coords = [];
    }

//Arrêter le suivi
    function stopTracking() {
        clearLine();
        isRunning = false;
        if (lastPosition) {
            map.setView(lastPosition, IDLE_ZOOM);
    }
        updateButtonsUI(false);
        coords = [];
    }