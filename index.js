let currentMinQuantity = 0;
let selectedCategories = new Set();

// фильтрация по типам
let showPartner = true;
let showNasha   = true;
let showOther   = true;

// ГИБДД (синие метки)
let showGibdd = true;

ymaps.ready(init);

function init() {
    fetch('bukshin.json') // сюда положи свой JSON
        .then(response => response.json())
        .then(obj => {
            console.log('raw data:', obj);

            const searchControls = new ymaps.control.SearchControl({
                options: {
                    float: 'right',
                    noPlacemark: true
                }
            });

            const myMap = new ymaps.Map('map', {
                center: [55.76, 37.64],
                zoom: 7,
                controls: [searchControls]
            });

            const removeControls = [
                'geolocationControl',
                'trafficControl',
                'fullscreenControl',
                'zoomControl',
                'rulerControl',
                'typeSelector'
            ];
            removeControls.forEach(ctrl => myMap.controls.remove(ctrl));

            const objectManager = new ymaps.ObjectManager({
                clusterize: true,
                clusterIconLayout: 'default#pieChart'
            });

            let minLatitude = Infinity, maxLatitude = -Infinity;
            let minLongitude = Infinity, maxLongitude = -Infinity;

            let minQuantity = Infinity;
            let maxQuantity = -Infinity;

            const validFeatures = [];

            obj.features.forEach(feature => {
                if (!feature.geometry || !Array.isArray(feature.geometry.coordinates)) return;

                const [longitude, latitude] = feature.geometry.coordinates;
                const lat = Number(latitude);
                const lon = Number(longitude);

                if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

                // Yandex ожидает [lat, lon]
                feature.geometry.coordinates = [lat, lon];

                minLatitude = Math.min(minLatitude, lat);
                maxLatitude = Math.max(maxLatitude, lat);
                minLongitude = Math.min(minLongitude, lon);
                maxLongitude = Math.max(maxLongitude, lon);

                const q = extractQuantity(feature);
                if (q !== null) {
                    if (!feature.properties) feature.properties = {};
                    feature.properties.quantity = q;

                    if (q < minQuantity) minQuantity = q;
                    if (q > maxQuantity) maxQuantity = q;
                }

                validFeatures.push(feature);
            });

            if (validFeatures.length === 0) {
                console.warn('Нет точек для отображения.');
                return;
            }

            if (minQuantity === Infinity || maxQuantity === -Infinity) {
                minQuantity = 0;
                maxQuantity = 0;
            }

            console.log('quantity min =', minQuantity, 'max =', maxQuantity);

            obj.features = validFeatures;
            objectManager.removeAll();
            objectManager.add(obj);
            myMap.geoObjects.add(objectManager);

            if (minLatitude !== Infinity && maxLatitude !== -Infinity &&
                minLongitude !== Infinity && maxLongitude !== -Infinity) {
                const bounds = [
                    [minLatitude, minLongitude],
                    [maxLatitude, maxLongitude]
                ];
                myMap.setBounds(bounds, { checkZoomRange: true });
            }

            setupFilterUI(minQuantity, maxQuantity, objectManager);
        })
        .catch(err => {
            console.error('Ошибка загрузки bukshin.json:', err);
        });
}

// пытается вытащить quantity из properties или из HTML балуна
function extractQuantity(feature) {
    if (!feature.properties) return null;

    // если есть properties.quantity — используем его
    if (
        feature.properties.quantity !== undefined &&
        feature.properties.quantity !== null &&
        feature.properties.quantity !== ''
    ) {
        const qNum = Number(feature.properties.quantity);
        if (Number.isFinite(qNum)) return qNum;
    }

    // попытка вытащить из текста балуна
    const body = feature.properties.balloonContentBody;
    if (typeof body === 'string') {
        const re = /Кол-во\s+ДК\s+за\s+месяц:\s*<span[^>]*>([\d\s]+)/i;
        const match = body.match(re);
        if (match && match[1]) {
            const numStr = match[1].replace(/\s+/g, '');
            const q = parseInt(numStr, 10);
            if (!isNaN(q)) return q;
        }
    }
    return null;
}

function setupFilterUI(minQuantity, maxQuantity, objectManager) {
    const filterToggle = document.getElementById('filter-toggle');
    const filterPanel = document.getElementById('filter-panel');
    const range = document.getElementById('quantity-range');
    const input = document.getElementById('quantity-input');
    const currentValueLabel = document.getElementById('filter-current-value');

    const categoryToggle = document.getElementById('category-toggle');
    const categoryPanel = document.getElementById('category-panel');
    const categoryCheckboxes = document.querySelectorAll('.category-checkbox');
    const categoryAllBtn = document.getElementById('category-all');
    const categoryResetBtn = document.getElementById('category-reset');

    const typeToggle = document.getElementById('type-toggle');
    const typePanel = document.getElementById('type-panel');
    const typeCheckboxes = document.querySelectorAll('.type-checkbox');
    const typeAllBtn = document.getElementById('type-all');
    const typeResetBtn = document.getElementById('type-reset');

    const gibddToggle = document.getElementById('gibdd-toggle');

    if (!filterToggle || !filterPanel || !range || !input || !currentValueLabel) {
        console.warn('Элементы фильтра не найдены в DOM.');
        return;
    }

    filterPanel.style.display = 'none';
    range.min = minQuantity;
    range.max = maxQuantity;
    range.step = 1;
    range.value = minQuantity;
    input.min = minQuantity;
    input.max = maxQuantity;
    input.step = 1;
    input.value = minQuantity;
    currentMinQuantity = minQuantity;

    function updateCurrentValueLabel(minVal) {
        currentValueLabel.textContent = `Показываются точки с кол-вом ≥ ${minVal}`;
    }
    updateCurrentValueLabel(minQuantity);

    // === ФИЛЬТР ПО КОЛИЧЕСТВУ ДК ===
    filterToggle.addEventListener('click', () => {
        filterPanel.style.display = filterPanel.style.display === 'block' ? 'none' : 'block';
    });
    range.addEventListener('input', () => {
        const val = parseInt(range.value, 10);
        input.value = val;
        applyFilter(val, objectManager);
        updateCurrentValueLabel(val);
    });
    input.addEventListener('input', () => {
        let val = parseInt(input.value, 10);
        if (isNaN(val)) val = minQuantity;
        if (val < minQuantity) val = minQuantity;
        if (val > maxQuantity) val = maxQuantity;
        input.value = val;
        range.value = val;
        applyFilter(val, objectManager);
        updateCurrentValueLabel(val);
    });

    // === КАТЕГОРИИ ===
    const updateCategoryToggleState = () => {
        if (!categoryToggle) return;
        if (selectedCategories.size > 0) categoryToggle.classList.add('active');
        else categoryToggle.classList.remove('active');
    };
    if (categoryToggle && categoryPanel) {
        categoryPanel.style.display = 'none';
        categoryToggle.addEventListener('click', () => {
            categoryPanel.style.display =
                categoryPanel.style.display === 'block' ? 'none' : 'block';
        });
    }
    if (categoryCheckboxes && categoryCheckboxes.length) {
        Array.from(categoryCheckboxes).forEach(cb => {
            cb.addEventListener('change', () => {
                const cat = cb.dataset.cat;
                if (!cat) return;
                if (cb.checked) selectedCategories.add(cat);
                else selectedCategories.delete(cat);
                updateCategoryToggleState();
                applyFilter(currentMinQuantity, objectManager);
            });
        });
    }
    if (categoryAllBtn && categoryCheckboxes.length) {
        categoryAllBtn.addEventListener('click', () => {
            selectedCategories.clear();
            Array.from(categoryCheckboxes).forEach(cb => {
                cb.checked = true;
                const cat = cb.dataset.cat;
                if (cat) selectedCategories.add(cat);
            });
            updateCategoryToggleState();
            applyFilter(currentMinQuantity, objectManager);
        });
    }
    if (categoryResetBtn && categoryCheckboxes.length) {
        categoryResetBtn.addEventListener('click', () => {
            selectedCategories.clear();
            Array.from(categoryCheckboxes).forEach(cb => (cb.checked = false));
            updateCategoryToggleState();
            applyFilter(currentMinQuantity, objectManager);
        });
    }

    // === ТИПЫ (Партнёр/Наша/Остальные) ===
    const updateTypeToggleState = () => {
        if (!typeToggle) return;
        if (showPartner && showNasha && showOther) typeToggle.classList.remove('active');
        else typeToggle.classList.add('active');
    };
    if (typeToggle && typePanel) {
        typePanel.style.display = 'none';
        typeToggle.addEventListener('click', () => {
            typePanel.style.display =
                typePanel.style.display === 'block' ? 'none' : 'block';
        });
    }
    if (typeCheckboxes && typeCheckboxes.length) {
        Array.from(typeCheckboxes).forEach(cb => {
            cb.addEventListener('change', () => {
                const t = cb.dataset.type;
                if (!t) return;
                const checked = cb.checked;
                if (t === 'partner') showPartner = checked;
                if (t === 'nasha') showNasha = checked;
                if (t === 'other') showOther = checked;
                updateTypeToggleState();
                applyFilter(currentMinQuantity, objectManager);
            });
        });
    }
    if (typeAllBtn && typeCheckboxes.length) {
        typeAllBtn.addEventListener('click', () => {
            showPartner = true;
            showNasha = true;
            showOther = true;
            Array.from(typeCheckboxes).forEach(cb => (cb.checked = true));
            updateTypeToggleState();
            applyFilter(currentMinQuantity, objectManager);
        });
    }
    if (typeResetBtn && typeCheckboxes.length) {
        typeResetBtn.addEventListener('click', () => {
            showPartner = false;
            showNasha = false;
            showOther = false;
            Array.from(typeCheckboxes).forEach(cb => (cb.checked = false));
            updateTypeToggleState();
            applyFilter(currentMinQuantity, objectManager);
        });
    }

    // === ГИБДД (синие точки) ===
    if (gibddToggle) {
        showGibdd = true;
        gibddToggle.classList.add('active');
        gibddToggle.addEventListener('click', () => {
            showGibdd = !showGibdd;
            gibddToggle.classList.toggle('active', showGibdd);
            applyFilter(currentMinQuantity, objectManager);
        });
    }

    // первый запуск фильтра
    applyFilter(currentMinQuantity, objectManager);
}

function applyFilter(minQuantity, objectManager) {
    currentMinQuantity = minQuantity;
    if (!objectManager) return;

    objectManager.setFilter(obj => {
        const props = obj.properties || {};
        const options = obj.options || {};
        const preset = options.preset || 'islands#greenIcon';
        const isBlue = preset === 'islands#blueIcon'; // ГИБДД

        // === ГИБДД ===
        // показываем независимо от количества и категорий
        if (isBlue) {
            return showGibdd;
        }

        // === тип точки ===
        let markerType = props.markerType;
        if (!markerType) {
            if (preset === 'islands#greenIcon') markerType = 'partner';
            else if (preset === 'islands#yellowIcon') markerType = 'nasha';
            else markerType = 'other';
        }
        if (markerType === 'partner' && !showPartner) return false;
        if (markerType === 'nasha' && !showNasha) return false;
        if (markerType === 'other' && !showOther) return false;

        // === категории ===
        if (selectedCategories.size > 0) {
            const catsStr = typeof props.categories === 'string' ? props.categories : '';
            if (!catsStr) return false;
            const pointCats = catsStr.split(',').map(s => s.trim()).filter(Boolean);
            const hasAny = pointCats.some(cat => selectedCategories.has(cat));
            if (!hasAny) return false;
        }

        // === количество ДК ===
        const q = extractQuantity(obj);
        if (q === null) return false;
        return q >= currentMinQuantity;
    });
}
