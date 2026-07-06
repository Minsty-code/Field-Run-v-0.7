//====================
//Synchronisation des zones (Supabase)
//====================
//Ce fichier s'occupe de : sauvegarder une zone qu'on vient de fermer,
//charger les zones déjà existantes des autres joueurs au démarrage,
//et écouter en temps réel les nouvelles zones capturées par les autres.

//Convertit nos points [lat, lon] en chaîne GeoJSON Polygon (anneau fermé, [lon, lat])
    function pointsToGeoJSON(points) {
        const ring = points.map(p => [p[1], p[0]]);
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) {
            ring.push([first[0], first[1]]);
        }
        return JSON.stringify({
            type: "Polygon",
            coordinates: [ring],
        });
    }

//====================
//Sauvegarde d'une zone qu'on vient de capturer
//====================
    async function saveZoneToSupabase(points, area) {
        const geojson = pointsToGeoJSON(points);

        const { error } = await supabaseClient.rpc("insert_zone", {
            p_owner_name: currentUsername || "Joueur",
            p_geojson: geojson,
            p_area: area,
        });

        if (error) {
            // On ne bloque jamais le jeu si la sauvegarde échoue (ex: pas de réseau) —
            // la zone reste visible localement, juste pas partagée aux autres pour l'instant.
            console.warn("Impossible de sauvegarder la zone en ligne :", error.message);
        }
    }

//====================
//Chargement des zones déjà existantes au démarrage
//====================
    async function loadAllZonesFromSupabase() {
        const { data, error } = await supabaseClient.rpc("get_all_zones");

        if (error) {
            console.warn("Impossible de charger les zones existantes :", error.message);
            return;
        }

        data.forEach(row => addRemoteZoneToMap(row));
    }

//Ajoute une zone (venant de la base) sur la carte, sauf si c'est une des nôtres
//qu'on a déjà dessinée localement (pour éviter les doublons visuels)
    function addRemoteZoneToMap(row) {
        if (row.owner_id === currentUserId) return; // déjà affichée localement

        let geo;
        try {
            geo = JSON.parse(row.geojson);
        } catch (e) {
            return;
        }

        const ring = geo.coordinates[0];
        const latLngPoints = toLatLngPoints(ring);
        if (latLngPoints.length < 3) return;

        const layer = L.polygon(latLngPoints, {
            color: "#FF7A00", // couleur distincte pour les autres joueurs
            fillOpacity: 0.35,
        }).addTo(map);

        zones.push({
            id: row.id,
            owner: row.owner_id,
            points: latLngPoints,
            layer: layer,
        });
    }

//====================
//Écoute en temps réel des nouvelles zones capturées par d'autres joueurs
//====================
    function subscribeToZoneRealtime() {
        supabaseClient
            .channel("zones-realtime")
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "zones" },
                (payload) => {
                    const row = payload.new;
                    // La ligne brute contient geom en WKB, pas en GeoJSON —
                    // on recharge juste cette zone proprement via get_all_zones
                    // serait coûteux pour une seule zone, donc on reconvertit ici
                    // à partir des colonnes qu'on a déjà (owner_id, owner_name, area_m2).
                    // Pour la géométrie, le plus simple et fiable est de refaire un
                    // appel ciblé côté base plutôt que de parser le WKB en JS.
                    fetchSingleZoneGeoJSON(row.id).then(geoRow => {
                        if (geoRow) addRemoteZoneToMap(geoRow);
                    });
                }
            )
            .subscribe();
    }

//Récupère la géométrie GeoJSON d'une seule zone (utilisé après un événement realtime)
    async function fetchSingleZoneGeoJSON(zoneId) {
        const { data, error } = await supabaseClient
            .rpc("get_all_zones")
            .eq("id", zoneId); // NB: si ta version de supabase-js ne permet pas .eq() après rpc(),
                                // vois la remarque plus bas dans le message de Claude.

        if (error || !data || data.length === 0) return null;
        return data[0];
    }
