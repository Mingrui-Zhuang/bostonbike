// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoiZ3JhbnR6aHVhbmciLCJhIjoiY203ZjRweGVsMGZ1ODJsbjh2Nnp6cG0yeiJ9.v_uO07vKgW6Bt-WodpLmaA';

// Initialize the map
const map = new mapboxgl.Map({
    container: 'map', // ID of the div where the map will render
    style: 'mapbox://styles/mapbox/streets-v12', // Map style
    center: [-71.080655, 42.357751], // [longitude, latitude]
    zoom: 12.6, // Initial zoom level
    minZoom: 5, // Minimum allowed zoom
    maxZoom: 18 // Maximum allowed zoom
});

map.on('load', () => {
    // Adding the Boston bike lanes data source
    map.addSource('boston_route', {
      type: 'geojson',
      data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson?...'
    });
  
    // Adding the Boston bike lanes layer
    map.addLayer({
        id: 'bike-lanes',
        type: 'line',
        source: 'boston_route',
        paint: {
            'line-color': 'green',
            'line-width': 3,
            'line-opacity': 0.4
        }
    });
  
    // Adding the Cambridge bike lanes data source
    map.addSource('cambridge_route', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
    });
  
    // Adding the Cambridge bike lanes layer
    map.addLayer({
        id: 'cambridge-bike-lanes',
        type: 'line',
        source: 'cambridge_route',
        paint: {
            'line-color': 'green',
            'line-width': 3,
            'line-opacity': 0.4
        }
    });
  
    // Load the Bluebikes stations data
    const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
    // ...existing code...

    d3.json(jsonurl).then(jsonData => {
        let stations = jsonData.data.stations;

        // Append SVG to the map container
        const svg = d3.select('#map').append('svg');

        // Prevent scrolling when the mouse is over the SVG
        svg.on('wheel', (event) => {
            event.preventDefault();
        });

        // Helper function to convert coordinates
        function getCoords(station) {
            const point = new mapboxgl.LngLat(+station.lon, +station.lat);
            const { x, y } = map.project(point);
            return { cx: x, cy: y };
        }

        // Load the Bluebikes trips data
        // ...existing code...
        let timeFilter = -1;

        let departuresByMinute = Array.from({ length: 1440 }, () => []);
        let arrivalsByMinute = Array.from({ length: 1440 }, () => []);

        d3.csv("https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv").then(function(trips) {
            trips.forEach(trip => {
                trip.started_at = new Date(trip.started_at);
                trip.ended_at = new Date(trip.ended_at);

                let startedMinutes = minutesSinceMidnight(trip.started_at);
                let endedMinutes = minutesSinceMidnight(trip.ended_at);

                departuresByMinute[startedMinutes].push(trip);
                arrivalsByMinute[endedMinutes].push(trip);
            });

            const departures = d3.rollup(
                filterByMinute(departuresByMinute, timeFilter),
                (v) => v.length,
                (d) => d.start_station_id
            );

            const arrivals = d3.rollup(
                filterByMinute(arrivalsByMinute, timeFilter),
                (v) => v.length,
                (d) => d.end_station_id
            );

            stations = stations.map(station => {
                let id = station.short_name;
                station.departures = departures.get(id) ?? 0;
                station.arrivals = arrivals.get(id) ?? 0;
                station.totalTraffic = station.departures + station.arrivals;
                return station;
            });

            // Create a D3 scale to map the traffic data to circle radii
            const radiusScale = d3.scaleSqrt()
                .domain([0, d3.max(stations, d => d.totalTraffic)])
                .range([0, 30]);

            // Define the station flow scale
            let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

            // Append circles to the SVG for each station
            const circles = svg.selectAll('circle')
                .data(stations)
                .enter()
                .append('circle')
                .attr('r', d => radiusScale(d.totalTraffic))
                .attr('fill', 'steelblue')
                .attr('stroke', 'white')
                .attr('stroke-width', 1)
                .attr('opacity', 0.8)
                .style('pointer-events', 'auto')
                .style('--departure-ratio', d => stationFlow(d.departures / d.totalTraffic))
                .each(function(d) {
                    d3.select(this)
                        .append('title')
                        .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
                });

            // Function to update circle positions when the map moves/zooms
            function updatePositions() {
                circles
                .attr('cx', d => getCoords(d).cx)  // Get the x coordinate
                .attr('cy', d => getCoords(d).cy); // Get the y coordinate
            }

            // Initial position update when map loads
            updatePositions();

            // Reposition markers on map interactions
            map.on('move', updatePositions);
            map.on('zoom', updatePositions);
            map.on('resize', updatePositions);
            map.on('moveend', updatePositions);

            // Step 5: Interactive data filtering
            const timeSlider = document.getElementById('time-slider');
            const selectedTime = document.getElementById('selected-time');
            const anyTimeLabel = document.getElementById('any-time');
    

            function formatTime(minutes) {
                const date = new Date(0, 0, 0, 0, minutes);
                return date.toLocaleString('en-US', { timeStyle: 'short' });
            }

            function minutesSinceMidnight(date) {
                return date.getHours() * 60 + date.getMinutes();
            }


            function filterByMinute(tripsByMinute, minute) {
                let minMinute = (minute - 60 + 1440) % 1440;
                let maxMinute = (minute + 60) % 1440;

                if (minMinute > maxMinute) {
                    let beforeMidnight = tripsByMinute.slice(minMinute);
                    let afterMidnight = tripsByMinute.slice(0, maxMinute);
                    return beforeMidnight.concat(afterMidnight).flat();
                } else {
                    return tripsByMinute.slice(minMinute, maxMinute).flat();
                }
            }

            function updateTimeDisplay() {
                timeFilter = Number(timeSlider.value);

                if (timeFilter === -1) {
                    selectedTime.textContent = '';
                    anyTimeLabel.style.display = 'block';
                } else {
                    selectedTime.textContent = formatTime(timeFilter);
                    anyTimeLabel.style.display = 'none';
                }


                const filteredDepartures = d3.rollup(
                    filterByMinute(departuresByMinute, timeFilter),
                    (v) => v.length,
                    (d) => d.start_station_id
                );

                const filteredArrivals = d3.rollup(
                    filterByMinute(arrivalsByMinute, timeFilter),
                    (v) => v.length,
                    (d) => d.end_station_id
                );

                // const filteredStations = stations.map(station => {
                //     station = { ...station };
                //     station.departures = filteredDepartures.filter(trip => trip.start_station_id === station.short_name).length;
                //     station.arrivals = filteredArrivals.filter(trip => trip.end_station_id === station.short_name).length;
                //     station.totalTraffic = station.departures + station.arrivals;
                //     return station;
                // });

                const filteredStations = stations.map(station => {
                    let id = station.short_name;
                    station.departures = filteredDepartures.get(id) ?? 0;
                    station.arrivals = filteredArrivals.get(id) ?? 0;
                    station.totalTraffic = station.departures + station.arrivals;
                    return station;
                });

                const radiusScale = d3.scaleSqrt()
                    .domain([0, d3.max(filteredStations, d => d.totalTraffic)])
                    .range(timeFilter === -1 ? [0, 30] : [0, 30]);

                const circles = svg.selectAll('circle')
                    .data(filteredStations, d => d.short_name);

                circles.enter()
                    .append('circle')
                    .merge(circles)
                    .attr('r', d => radiusScale(d.totalTraffic))
                    .attr('fill', 'steelblue')
                    .attr('stroke', 'white')
                    .attr('stroke-width', 1)
                    .attr('opacity', 0.8)
                    .style('pointer-events', 'auto')
                    .style('--departure-ratio', d => stationFlow(d.departures / d.totalTraffic))
                    .each(function(d) {
                        d3.select(this)
                            .append('title')
                            .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
                    });

                circles.exit().remove();

                updatePositions();
            }

            timeSlider.addEventListener('input', updateTimeDisplay);
            updateTimeDisplay();

        }).catch(error => {
            console.error('Error loading CSV:', error);
        });

    }).catch(error => {
        console.error('Error loading JSON:', error);
    });
});