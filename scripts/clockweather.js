// Clock & Weather version 1.3.3 Build 020
// File location: scripts/clockweather.js
// COMPLETE VERSION with all methods

console.log("Clock & Weather | Script loaded");

class ClockWeatherApp extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static get DEFAULT_OPTIONS() {
    return {
      id: "clockweather-app",
      classes: ["clockweather"],
      tag: "div",
      window: {
        title: "CLOCKWEATHER.Title",
        icon: "fas fa-cloud-sun",
        resizable: true
      },
      position: {
        width: 450,
        height: "auto"
      }
    };
  }

  static get PARTS() {
    return {
      form: {
        template: "modules/clockweather/templates/clockweather.html"
      }
    };
  }

  async _prepareContext(options) {
    const currentDateTime = this.getCurrentDateTime();
    const shiftNumber = this.calculateShiftNumber(currentDateTime.time);
    const shiftName = this.getShiftName(shiftNumber);
    const weatherData = this.getWeatherForDateAndShift(currentDateTime.date, shiftNumber);
    const altitude = game.settings.get("clockweather", "altitude");
    const fxActive = game.settings.get("clockweather", "fxActive");
    const dailyAccumulation = this.getDailyAccumulation();
    
    let affectedRegions = 0;
    if (game.settings.get("clockweather", "enableTerrainEffects") && canvas.scene) {
      affectedRegions = this.countAffectedRegions();
    }

    return {
      date: currentDateTime.date,
      time: currentDateTime.time,
      shift: shiftName,
      shiftNumber: shiftNumber,
      weather: weatherData,
      altitude: altitude,
      isGM: game.user.isGM,
      fxMasterEnabled: game.modules.get("fxmaster")?.active,
      fxActive: fxActive,
      dailyAccumulation: dailyAccumulation,
      affectedRegions: affectedRegions,
      terrainEffectsEnabled: game.settings.get("clockweather", "enableTerrainEffects")
    };
  }

  countAffectedRegions() {
    if (!canvas.scene?.regions) return 0;
    
    let count = 0;
    for (const region of canvas.scene.regions) {
      const hasMovementBehavior = region.behaviors?.some(b => 
        b.type === "adjustDarknessLevel" || 
        b.type === "executeMacro" ||
        b.name?.toLowerCase().includes("movement") ||
        b.name?.toLowerCase().includes("terrain")
      );
      
      if (hasMovementBehavior) count++;
    }
    
    return count;
  }

  async modifyRegionTerrain(movementPenalty) {
    if (!game.settings.get("clockweather", "enableTerrainEffects")) return;
    if (!game.user.isGM) return;
    if (!canvas.scene?.regions) return;
    
    console.log(`Clock & Weather | Modifying region terrain, penalty: ${movementPenalty}%`);
    
    const modifiedRegions = [];
    
    for (const region of canvas.scene.regions) {
      const hasMovementBehavior = region.behaviors?.some(b => 
        b.type === "adjustDarknessLevel" ||
        b.name?.toLowerCase().includes("movement") ||
        b.name?.toLowerCase().includes("terrain")
      );
      
      if (hasMovementBehavior) {
        if (!region.flags?.clockweather?.originalSettings) {
          await region.setFlag("clockweather", "originalSettings", {
            behaviors: region.behaviors
          });
        }
        
        await region.setFlag("clockweather", "weatherPenalty", movementPenalty);
        modifiedRegions.push(region.name || "Unnamed Region");
      }
    }
    
    if (modifiedRegions.length > 0) {
      console.log(`Clock & Weather | Modified ${modifiedRegions.length} regions:`, modifiedRegions);
      ui.notifications.info(`🗺️ ${modifiedRegions.length} region(s) affected by weather`);
    }
  }

  async restoreRegionTerrain() {
    if (!game.user.isGM) return;
    if (!canvas.scene?.regions) return;
    
    console.log("Clock & Weather | Restoring region terrain to original state");
    
    let restoredCount = 0;
    
    for (const region of canvas.scene.regions) {
      if (region.flags?.clockweather?.originalSettings) {
        await region.unsetFlag("clockweather", "weatherPenalty");
        await region.unsetFlag("clockweather", "originalSettings");
        restoredCount++;
      }
    }
    
    if (restoredCount > 0) {
      console.log(`Clock & Weather | Restored ${restoredCount} regions`);
    }
  }

  getCurrentDateTime() {
    const saved = game.settings.get("clockweather", "currentDateTime");
    if (saved && saved.date && saved.time) {
      return saved;
    }
    
    const weatherData = this.getWeatherData();
    const firstDate = Object.keys(weatherData)[0] || "2014-06-14";
    return {
      date: firstDate,
      time: "00:00"
    };
  }

  calculateShiftNumber(time) {
    const [hours, minutes] = time.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes;
    
    if (totalMinutes >= 0 && totalMinutes < 240) return 1;
    if (totalMinutes >= 240 && totalMinutes < 480) return 2;
    if (totalMinutes >= 480 && totalMinutes < 720) return 3;
    if (totalMinutes >= 720 && totalMinutes < 960) return 4;
    if (totalMinutes >= 960 && totalMinutes < 1200) return 5;
    return 6;
  }

  getShiftName(shiftNumber) {
    return game.i18n.localize(`CLOCKWEATHER.Shift${shiftNumber}`);
  }

  getWeatherData() {
    return game.settings.get("clockweather", "weatherData") || {};
  }

  getWeatherForDateAndShift(date, shiftNumber) {
    const weatherData = this.getWeatherData();
    const dayData = weatherData[date];
    
    if (!dayData || !dayData.shifts) {
      return {
        weatherCode: game.i18n.localize("CLOCKWEATHER.NoData"),
        windCode: "",
        windDirection: "",
        windDirectionLocalized: "",
        windspeed: 0,
        temp: 0,
        feelsLike: 0,
        visibility: 10000,
        precipitation: null
      };
    }

    const shiftData = dayData.shifts.find(s => s.shift === shiftNumber);
    
    if (!shiftData) {
      return {
        weatherCode: game.i18n.localize("CLOCKWEATHER.NoData"),
        windCode: "",
        windDirection: "",
        windDirectionLocalized: "",
        windspeed: 0,
        temp: 0,
        feelsLike: 0,
        visibility: 10000,
        precipitation: null
      };
    }

    const altitude = game.settings.get("clockweather", "altitude");
    const adjustedTemp = shiftData.temp - Math.round(altitude / 150);
    const feelsLike = this.calculateFeelsLike(adjustedTemp, shiftData.windspeed);
    const visibility = this.calculateVisibility(shiftData.weatherCode, shiftData.windspeed);
    const windDir = shiftData.windDirection || "N";
    
    let precipitationData = null;
    if (shiftData.precipitation) {
      precipitationData = {
        ...shiftData.precipitation,
        movementPenalty: this.calculateMovementPenalty(shiftData.precipitation),
        impactLevel: this.getPrecipitationImpact(shiftData.precipitation)
      };
    }
    
    return {
      weatherCode: game.i18n.localize(`CLOCKWEATHER.Weathertype.${shiftData.weatherCode}`) || shiftData.weatherCode,
      windCode: game.i18n.localize(`CLOCKWEATHER.Windtype.${shiftData.windCode}`) || shiftData.windCode,
      windDirection: windDir,
      windDirectionLocalized: game.i18n.localize(`CLOCKWEATHER.WindDir.${windDir}`) || windDir,
      windspeed: shiftData.windspeed,
      temp: adjustedTemp,
      feelsLike: feelsLike,
      visibility: visibility,
      visibilityText: this.getVisibilityText(visibility),
      rawWeatherCode: shiftData.weatherCode,
      precipitation: precipitationData
    };
  }

  calculateMovementPenalty(precipitation) {
    if (!precipitation || !precipitation.intensity) return 0;
    
    const intensity = precipitation.intensity;
    const type = precipitation.type || 'rain';
    
    const basePenalties = {
      'light': 5,
      'moderate': 15,
      'heavy': 30,
      'extreme': 50,
      'catastrophic': 75
    };
    
    const typeMultipliers = {
      'rain': 1.0,
      'snow': 1.5,
      'ice': 2.0,
      'hail': 1.8,
      'sleet': 1.3,
      'mixed': 1.4
    };
    
    const basePenalty = basePenalties[intensity] || 0;
    const multiplier = typeMultipliers[type] || 1.0;
    
    return Math.min(Math.round(basePenalty * multiplier), 95);
  }

  getPrecipitationImpact(precipitation) {
    if (!precipitation || !precipitation.intensity) return 'none';
    
    const levels = {
      'light': 'minimal',
      'moderate': 'noticeable',
      'heavy': 'significant',
      'extreme': 'severe',
      'catastrophic': 'catastrophic'
    };
    
    return levels[precipitation.intensity] || 'none';
  }

  getDailyAccumulation() {
    const stored = game.settings.get("clockweather", "dailyAccumulation");
    const currentDate = this.getCurrentDateTime().date;
    
    if (!stored || stored.startDate !== currentDate) {
      return {
        snow: 0,
        rain: 0,
        ice: 0,
        hail: 0,
        startDate: currentDate
      };
    }
    
    return stored;
  }

  async updateDailyAccumulation(precipitation) {
    if (!precipitation) return;
    
    const accumulation = this.getDailyAccumulation();
    const type = precipitation.type || 'rain';
    const amount = precipitation.accumulation || 0;
    
    accumulation[type] = (accumulation[type] || 0) + amount;
    
    await game.settings.set("clockweather", "dailyAccumulation", accumulation);
    
    console.log(`Clock & Weather | Updated accumulation: ${type} +${amount} (total: ${accumulation[type]})`);
    
    this.checkExtremeAccumulation(accumulation);
  }

  checkExtremeAccumulation(accumulation) {
    const warnings = [];
    
    if (accumulation.snow > 50) {
      warnings.push(`⚠️ Catastrophic snowfall! ${accumulation.snow.toFixed(1)}cm accumulated - Buildings at risk!`);
    } else if (accumulation.snow > 30) {
      warnings.push(`⚠️ Extreme snowfall! ${accumulation.snow.toFixed(1)}cm accumulated`);
    }
    
    if (accumulation.rain > 100) {
      warnings.push(`⚠️ Catastrophic flooding! ${accumulation.rain.toFixed(1)}mm rain - Severe flood risk!`);
    } else if (accumulation.rain > 50) {
      warnings.push(`⚠️ Flood risk! ${accumulation.rain.toFixed(1)}mm rain accumulated`);
    }
    
    if (accumulation.ice > 15) {
      warnings.push(`⚠️ Catastrophic ice accumulation! ${accumulation.ice.toFixed(1)}mm - Power lines down!`);
    } else if (accumulation.ice > 10) {
      warnings.push(`⚠️ Dangerous ice conditions! ${accumulation.ice.toFixed(1)}mm ice accumulated`);
    }
    
    if (accumulation.hail > 20) {
      warnings.push(`⚠️ Catastrophic hail! ${accumulation.hail.toFixed(1)}cm - Severe property damage!`);
    } else if (accumulation.hail > 10) {
      warnings.push(`⚠️ Severe hail storm! ${accumulation.hail.toFixed(1)}cm hail accumulated`);
    }
    
    if (warnings.length > 0 && game.user.isGM) {
      warnings.forEach(warning => ui.notifications.warn(warning));
    }
  }

  async resetDailyAccumulation() {
    const currentDate = this.getCurrentDateTime().date;
    await game.settings.set("clockweather", "dailyAccumulation", {
      snow: 0,
      rain: 0,
      ice: 0,
      hail: 0,
      startDate: currentDate
    });
    console.log("Clock & Weather | Daily accumulation reset");
  }

  calculateVisibility(weatherCode, windspeed) {
    let baseVisibility = 10000;
    
    switch(weatherCode) {
      case "clear_sky":
      case "clear":
      case "fair":
        baseVisibility = 10000;
        break;
      case "partly_cloudy":
      case "cloudy":
        baseVisibility = 8000;
        break;
      case "overcast":
        baseVisibility = 6000;
        break;
      case "fog":
      case "mist":
        baseVisibility = 200;
        break;
      case "light_rain":
      case "light_snow":
        baseVisibility = 4000;
        break;
      case "rain":
      case "snow":
      case "sleet":
        baseVisibility = 1000;
        break;
      case "heavy_rain":
      case "heavy_snow":
      case "freezing_rain":
      case "hail":
        baseVisibility = 500;
        break;
      case "blizzard":
      case "whiteout":
      case "ice_storm":
      case "severe_hail":
        baseVisibility = 100;
        break;
      case "thunderstorm":
        baseVisibility = 2000;
        break;
      case "severe_thunderstorm":
        baseVisibility = 1000;
        break;
      case "tropical_storm":
        baseVisibility = 800;
        break;
      case "typhoon":
      case "hurricane":
        baseVisibility = 300;
        break;
      case "tornado":
        baseVisibility = 150;
        break;
      case "sandstorm":
      case "dust_storm":
        baseVisibility = 200;
        break;
      case "dust_devil":
        baseVisibility = 500;
        break;
      case "monsoon":
        baseVisibility = 600;
        break;
      case "volcanic_ash":
        baseVisibility = 300;
        break;
      case "acid_rain":
        baseVisibility = 1500;
        break;
    }
    
    if (windspeed > 20) {
      baseVisibility = Math.min(baseVisibility, baseVisibility * 0.5);
    } else if (windspeed > 15) {
      baseVisibility = Math.min(baseVisibility, baseVisibility * 0.7);
    }
    
    return Math.round(baseVisibility);
  }

  getVisibilityText(visibility) {
    if (visibility >= 10000) return game.i18n.localize("CLOCKWEATHER.Visibility.Excellent");
    if (visibility >= 4000) return game.i18n.localize("CLOCKWEATHER.Visibility.Good");
    if (visibility >= 1000) return game.i18n.localize("CLOCKWEATHER.Visibility.Moderate");
    if (visibility >= 200) return game.i18n.localize("CLOCKWEATHER.Visibility.Poor");
    return game.i18n.localize("CLOCKWEATHER.Visibility.VeryPoor");
  }

  calculateFeelsLike(temp, windspeed) {
    if (temp <= 10 && windspeed > 4.8) {
      const windKmh = windspeed * 3.6;
      const windChill = 13.12 + 0.6215 * temp - 11.37 * Math.pow(windKmh, 0.16) + 0.3965 * temp * Math.pow(windKmh, 0.16);
      return Math.round(windChill);
    }
    
    if (temp > 27 && windspeed < 3) {
      return Math.round(temp + 2);
    }
    
    if (windspeed > 8) {
      return Math.round(temp - 1);
    }
    
    return Math.round(temp);
  }

  _onRender(context, options) {
    super._onRender(context, options);
    
    const html = this.element;
    const app = this;
    
    console.log("Clock & Weather | _onRender called");
    
    // Populate date dropdown
    const dateSelect = html.querySelector('.date-select');
    if (dateSelect) {
      this.populateDateSelect(dateSelect, context.date);
    }
    
    // Set time dropdown value
    const timeSelect = html.querySelector('.time-select');
    if (timeSelect) {
      timeSelect.value = this.getClosestShiftTime(context.time);
    }
    
    const advanceButtons = html.querySelectorAll('.time-advance');
    console.log("Clock & Weather | Found advance buttons:", advanceButtons.length);
    
    advanceButtons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const hours = parseInt(btn.dataset.hours) || 0;
        console.log("Clock & Weather | Advance time:", hours);
        await app._advanceTime(hours);
      });
    });
    
    // Date select change
    if (dateSelect) {
      dateSelect.addEventListener('change', async (e) => {
        await app._changeDate(e.target.value);
      });
    }
    
    // Time select change
    if (timeSelect) {
      timeSelect.addEventListener('change', async (e) => {
        await app._changeTime(e.target.value);
      });
    }
    
    const altitudeSlider = html.querySelector('.altitude-slider');
    if (altitudeSlider) {
      altitudeSlider.addEventListener('input', (e) => {
        const newAltitude = parseInt(e.target.value) || 0;
        const label = html.querySelector('.altitude-value');
        if (label) label.textContent = `${newAltitude}m`;
      });
      
      altitudeSlider.addEventListener('change', async (e) => {
        const newAltitude = parseInt(e.target.value) || 0;
        await game.settings.set("clockweather", "altitude", newAltitude);
        app.render();
      });
    }
    
    const chatBtn = html.querySelector('.post-to-chat');
    if (chatBtn) {
      chatBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await app._postToChat();
      });
    }
    
    const fxBtn = html.querySelector('.toggle-fx');
    if (fxBtn) {
      fxBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await app._toggleFX();
      });
    }
    
    const saveBtn = html.querySelector('.save-datetime');
    if (saveBtn) {
      saveBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        ui.notifications.info(game.i18n.localize("CLOCKWEATHER.Saved"));
      });
    }
  }

  populateDateSelect(selectElement, currentDate) {
    const weatherData = this.getWeatherData();
    const dates = Object.keys(weatherData).sort();
    
    selectElement.innerHTML = '';
    
    if (dates.length === 0) {
      const option = document.createElement('option');
      option.value = currentDate;
      option.textContent = currentDate;
      selectElement.appendChild(option);
      return;
    }
    
    dates.forEach(date => {
      const option = document.createElement('option');
      option.value = date;
      option.textContent = date; // Simple YYYY-MM-DD format
      
      if (date === currentDate) {
        option.selected = true;
      }
      
      selectElement.appendChild(option);
    });
  }

  getClosestShiftTime(currentTime) {
    const [hours, minutes] = currentTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes;
    
    const shiftTimes = [
      { time: '00:00', minutes: 0 },
      { time: '04:00', minutes: 240 },
      { time: '08:00', minutes: 480 },
      { time: '12:00', minutes: 720 },
      { time: '16:00', minutes: 960 },
      { time: '20:00', minutes: 1200 }
    ];
    
    // Find closest shift
    let closest = shiftTimes[0];
    let minDiff = Math.abs(totalMinutes - closest.minutes);
    
    for (const shift of shiftTimes) {
      const diff = Math.abs(totalMinutes - shift.minutes);
      if (diff < minDiff) {
        minDiff = diff;
        closest = shift;
      }
    }
    
    return closest.time;
  }

  async _advanceTime(hours) {
    console.log("Clock & Weather | _advanceTime called with", hours);
    
    const current = this.getCurrentDateTime();
    const [h, m] = current.time.split(':').map(Number);
    let newHours = h + hours;
    let newDate = current.date;

    if (newHours >= 24) {
      const date = new Date(current.date);
      date.setDate(date.getDate() + Math.floor(newHours / 24));
      newDate = date.toISOString().split('T')[0];
      newHours = newHours % 24;
      
      if (game.settings.get("clockweather", "resetAccumulationDaily")) {
        await this.resetDailyAccumulation();
      }
    } else if (newHours < 0) {
      const date = new Date(current.date);
      date.setDate(date.getDate() - Math.ceil(Math.abs(newHours) / 24));
      newDate = date.toISOString().split('T')[0];
      newHours = ((newHours % 24) + 24) % 24;
    }

    const newTime = `${String(newHours).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    
    await game.settings.set("clockweather", "currentDateTime", {
      date: newDate,
      time: newTime
    });

    const newShiftNumber = this.calculateShiftNumber(newTime);
    const newWeatherData = this.getWeatherForDateAndShift(newDate, newShiftNumber);
    
    if (newWeatherData.precipitation && hours > 0) {
      await this.updateDailyAccumulation(newWeatherData.precipitation);
      
      if (game.settings.get("clockweather", "enableTerrainEffects")) {
        await this.modifyRegionTerrain(newWeatherData.precipitation.movementPenalty);
      }
      
      if (newWeatherData.precipitation.movementPenalty >= 25 && game.user.isGM) {
        this.postPrecipitationWarning(newWeatherData);
      }
    } else if (!newWeatherData.precipitation && game.settings.get("clockweather", "enableTerrainEffects")) {
      await this.restoreRegionTerrain();
    }

    this.updateAmbientLighting(newTime);
    
    if (game.settings.get("clockweather", "autoFXMaster") && game.settings.get("clockweather", "fxActive")) {
      await this.updateFXMaster();
    }
    
    this.render();
  }

  async postPrecipitationWarning(weatherData) {
    const precipitation = weatherData.precipitation;
    if (!precipitation) return;
    
    const accumulation = this.getDailyAccumulation();
    const type = precipitation.type || 'rain';
    const unit = (type === 'snow' || type === 'hail') ? 'cm' : 'mm';
    const totalAmount = accumulation[type] || 0;
    
    let icon = '🌧️';
    if (type === 'snow') icon = '❄️';
    if (type === 'ice') icon = '🧊';
    if (type === 'hail') icon = '🌨️';
    if (type === 'sleet' || type === 'mixed') icon = '🌦️';
    
    let intensityClass = 'moderate';
    if (precipitation.intensity === 'extreme' || precipitation.intensity === 'catastrophic') {
      intensityClass = 'extreme';
    } else if (precipitation.intensity === 'heavy') {
      intensityClass = 'heavy';
    }
    
    const content = `
      <div class="clockweather-precipitation-warning ${intensityClass}">
        <h3>${icon} Weather Alert - ${precipitation.intensity.toUpperCase()}</h3>
        <p><strong>Conditions:</strong> ${weatherData.weatherCode}</p>
        <p><strong>Precipitation Type:</strong> ${precipitation.intensity} ${type}</p>
        <hr>
        <p><strong>Current Rate:</strong> ${precipitation.rate} ${unit}/hour</p>
        <p><strong>Shift Accumulation:</strong> ${precipitation.accumulation} ${unit} (4 hours)</p>
        <p><strong>Daily Total:</strong> ${totalAmount.toFixed(1)} ${unit}</p>
        <hr>
        <p class="impact-warning"><strong>Movement Impact:</strong> -${precipitation.movementPenalty}%</p>
        ${this.countAffectedRegions() > 0 ? `<p><strong>Affected Regions:</strong> ${this.countAffectedRegions()}</p>` : ''}
        ${precipitation.intensity === 'catastrophic' ? '<p class="catastrophic-warning">⚠️ CATASTROPHIC CONDITIONS - SEEK SHELTER IMMEDIATELY!</p>' : ''}
      </div>
    `;
    
    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker(),
      content: content,
      whisper: game.users.filter(u => u.isGM).map(u => u.id)
    });
  }

  async _changeDate(newDate) {
    const current = this.getCurrentDateTime();
    
    await game.settings.set("clockweather", "currentDateTime", {
      date: newDate,
      time: current.time
    });
    
    if (game.settings.get("clockweather", "autoFXMaster") && game.settings.get("clockweather", "fxActive")) {
      await this.updateFXMaster();
    }
    
    this.render();
  }

  async _changeTime(newTime) {
    const current = this.getCurrentDateTime();
    
    await game.settings.set("clockweather", "currentDateTime", {
      date: current.date,
      time: newTime
    });
    
    this.updateAmbientLighting(newTime);
    
    if (game.settings.get("clockweather", "autoFXMaster") && game.settings.get("clockweather", "fxActive")) {
      await this.updateFXMaster();
    }
    
    this.render();
  }

  async _toggleFX() {
    if (!game.modules.get("fxmaster")?.active) {
      ui.notifications.warn(game.i18n.localize("CLOCKWEATHER.FXMasterNotActive"));
      return;
    }
    
    const isActive = game.settings.get("clockweather", "fxActive");
    
    if (isActive) {
      await this.clearAllWeatherEffects();
      await game.settings.set("clockweather", "fxActive", false);
      ui.notifications.info(game.i18n.localize("CLOCKWEATHER.FXMasterDisabled"));
    } else {
      await this.updateFXMaster();
      await game.settings.set("clockweather", "fxActive", true);
      ui.notifications.info(game.i18n.localize("CLOCKWEATHER.FXMasterEnabled"));
    }
    
    this.render();
  }

  async _postToChat() {
    const currentDateTime = this.getCurrentDateTime();
    const shiftNumber = this.calculateShiftNumber(currentDateTime.time);
    const shiftName = this.getShiftName(shiftNumber);
    const weatherData = this.getWeatherForDateAndShift(currentDateTime.date, shiftNumber);
    
    const chatContent = `
      <div class="clockweather-chat-message">
        <h3><i class="fas fa-cloud-sun"></i> ${game.i18n.localize("CLOCKWEATHER.Title")}</h3>
        <p><strong>${game.i18n.localize("CLOCKWEATHER.Date")}:</strong> ${currentDateTime.date}</p>
        <p><strong>${game.i18n.localize("CLOCKWEATHER.Time")}:</strong> ${currentDateTime.time}</p>
        <p><strong>${game.i18n.localize("CLOCKWEATHER.CurrentShift")}:</strong> ${shiftName}</p>
        <hr>
        <p><strong>${game.i18n.localize("CLOCKWEATHER.Conditions")}:</strong> ${weatherData.weatherCode}</p>
        <p><strong>${game.i18n.localize("CLOCKWEATHER.Wind")}:</strong> ${weatherData.windCode} ${weatherData.windDirection} (${weatherData.windspeed} m/s)</p>
        <p><strong>${game.i18n.localize("CLOCKWEATHER.Temperature")}:</strong> ${weatherData.temp}°C</p>
        <p><strong>${game.i18n.localize("CLOCKWEATHER.FeelsLike")}:</strong> ${weatherData.feelsLike}°C</p>
        <p><strong>${game.i18n.localize("CLOCKWEATHER.Visibility.Visibility")}:</strong> ${weatherData.visibilityText} (${weatherData.visibility}m)</p>
      </div>
    `;
    
    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker(),
      content: chatContent
    });
    
    ui.notifications.info(game.i18n.localize("CLOCKWEATHER.PostedToChat"));
  }

  updateAmbientLighting(time) {
    if (!game.settings.get("clockweather", "controlAmbientLight")) return;
    if (!game.user.isGM) return;
    if (!canvas.scene) return;

    const [hours] = time.split(':').map(Number);
    
    let darkness = 0;
    
    if (hours >= 22 || hours < 4) {
      darkness = 1.0;
    } else if (hours >= 4 && hours < 6) {
      darkness = 0.7;
    } else if (hours >= 6 && hours < 18) {
      darkness = 0.0;
    } else if (hours >= 18 && hours < 22) {
      darkness = 0.5;
    }

    canvas.scene.update({ darkness: darkness });
  }

  async updateFXMaster() {
    console.log("Clock & Weather | === updateFXMaster START ===");
    
    if (!game.modules.get("fxmaster")?.active) {
      console.warn("Clock & Weather | FXMaster module is not active");
      return;
    }
    
    if (!game.user.isGM) {
      console.warn("Clock & Weather | Only GM can control FXMaster");
      return;
    }
    
    if (!canvas.scene) {
      console.warn("Clock & Weather | No active scene");
      return;
    }

    const currentDateTime = this.getCurrentDateTime();
    const shiftNumber = this.calculateShiftNumber(currentDateTime.time);
    const weatherData = this.getWeatherForDateAndShift(currentDateTime.date, shiftNumber);

    console.log("Clock & Weather | Current weather data:", weatherData);

    try {
      const existingEffects = ["clockweather-rain", "clockweather-snow", "clockweather-fog", 
                               "clockweather-leaves", "clockweather-dust"];
      
      for (const effectId of existingEffects) {
        try {
          await canvas.scene.unsetFlag("fxmaster", `effects.${effectId}`);
        } catch (e) {
          // Effect might not exist
        }
      }

      const effects = this.getWeatherEffects(weatherData);
      console.log("Clock & Weather | Effects to apply:", effects);

      for (const effect of effects) {
        try {
          Hooks.call("fxmaster.switchParticleEffect", {
            name: `clockweather-${effect.type}`,
            type: effect.type,
            options: effect.options
          });
          
          console.log(`Clock & Weather | ✓ Applied ${effect.type}`);
        } catch (error) {
          console.error(`Clock & Weather | Error applying effect ${effect.type}:`, error);
        }
      }

      if (game.settings.get("clockweather", "enableAmbientSound")) {
        await this.updateAmbientWeatherEffects(weatherData);
      } else {
        await this.clearAmbientWeatherEffects();
      }

      console.log("Clock & Weather | === updateFXMaster COMPLETE ===");
      
    } catch (error) {
      console.error("Clock & Weather | Error updating FXMaster:", error);
      ui.notifications.error(`FXMaster error: ${error.message}`);
    }
  }

  async updateAmbientWeatherEffects(weatherData) {
    if (!canvas.scene) return;
    
    const weatherCode = weatherData.rawWeatherCode || "";
    const windspeed = weatherData.windspeed;
    const environment = game.settings.get("clockweather", "soundEnvironment");
    
    console.log("Clock & Weather | updateAmbientWeatherEffects called");
    console.log("Clock & Weather | Weather:", weatherCode, "Wind:", windspeed);
    
    await this.clearAmbientWeatherEffects();
    
    let soundFile = null;
    let needsThunderstorm = false;
    
    if (weatherCode.includes("thunder") || weatherCode.includes("typhoon")) {
      needsThunderstorm = true;
      soundFile = "modules/clockweather/sounds/heavy_rain.ogg";
    } else if (weatherCode.includes("heavy_rain")) {
      soundFile = "modules/clockweather/sounds/heavy_rain.ogg";
    } else if (weatherCode.includes("rain")) {
      soundFile = "modules/clockweather/sounds/rain.ogg";
    } else if (weatherCode.includes("sandstorm") || weatherCode.includes("dust")) {
      soundFile = "modules/clockweather/sounds/sandstorm.ogg";
    } else if (windspeed > 7 && windspeed < 16) {
      soundFile = "modules/clockweather/sounds/soft_wind.ogg";
    } else if (windspeed >= 16) {
      soundFile = "modules/clockweather/sounds/strong_wind.ogg";
    }
    
    if (environment === "sea") {
      if (windspeed > 19 || weatherCode.includes("storm") || weatherCode.includes("typhoon")) {
        soundFile = "modules/clockweather/sounds/large_waves.ogg";
      } else if (windspeed > 7 && windspeed < 19) {
        soundFile = "modules/clockweather/sounds/waves_02.ogg";
      } else if (!weatherCode.includes("sandstorm") && !weatherCode.includes("dust")) {
        soundFile = "modules/clockweather/sounds/waves.ogg";
      }
    }
    
    if (soundFile) {
      console.log(`Clock & Weather | Starting ambient sound: ${soundFile}`);
      try {
        const ambientSound = await foundry.audio.AudioHelper.play(
          { src: soundFile, volume: 0.2, loop: true },
          true
        );
        
        if (!game.clockweather) game.clockweather = {};
        game.clockweather.ambientSound = ambientSound;
        
        console.log("Clock & Weather | ✓ Ambient sound started");
      } catch (error) {
        console.error(`Clock & Weather | Error playing sound:`, error);
      }
    }
    
    if (needsThunderstorm) {
      console.log("Clock & Weather | Starting thunderstorm");
      this.startThunderstormEffect();
    }
  }

  startThunderstormEffect() {
    this.stopThunderstormEffect();
    
    if (!game.clockweather) game.clockweather = {};
    game.clockweather.stormActive = true;
    
    console.log("Clock & Weather | ⚡ Thunderstorm started");
    
    const THUNDER_PATH = "modules/clockweather/sounds/";
    const THUNDER_FILES = ["thunderstorm.ogg"];
    const MIN_DELAY = 200;
    const MAX_DELAY = 900;
    const MAX_RADIUS = 120;
    const LIGHT_COLOR = "#c8e4ff";
    const BASE_ALPHA = 0.6;
    const MIN_INTERVAL = 8000;
    const MAX_INTERVAL = 30000;
    const THUNDER_VOLUME = 0.5;
    
    const lightningAndThunder = async () => {
      if (!game.clockweather?.stormActive) return;
      
      const thunderFile = THUNDER_PATH + THUNDER_FILES[Math.floor(Math.random() * THUNDER_FILES.length)];
      const delay = Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY)) + MIN_DELAY;
      const distanceFactor = 1 - delay / MAX_DELAY;
      const radius = MAX_RADIUS * (0.4 + 0.6 * distanceFactor);
      const alpha = BASE_ALPHA * (0.5 + 0.5 * distanceFactor);
      
      const x = Math.random() * canvas.scene.width;
      const y = Math.random() * canvas.scene.height;
      
      try {
        const [lightDoc] = await canvas.scene.createEmbeddedDocuments("AmbientLight", [{
          x, y,
          config: {
            dim: radius,
            bright: radius * 0.6,
            color: LIGHT_COLOR,
            alpha: alpha,
            animation: { type: "pulse", speed: 6, intensity: 6 },
            walls: false
          },
          flags: {
            clockweather: {
              isWeatherEffect: true,
              effectType: "lightning"
            }
          }
        }]);
        
        const light = canvas.lighting.get(lightDoc.id);
        
        const flashes = Math.floor(2 + Math.random() * 2);
        for (let i = 0; i < flashes; i++) {
          await light.document.update({ hidden: false, "config.alpha": alpha });
          await new Promise(r => setTimeout(r, 60 + Math.random() * 80));
          await light.document.update({ hidden: true, "config.alpha": 0 });
          await new Promise(r => setTimeout(r, 80 + Math.random() * 120));
        }
        
        await new Promise(r => setTimeout(r, delay));
        
        foundry.audio.AudioHelper.play({ src: thunderFile, volume: THUNDER_VOLUME, loop: false }, true);
        
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
        await canvas.scene.deleteEmbeddedDocuments("AmbientLight", [light.id]);
        
      } catch (error) {
        console.error("Clock & Weather | Error creating lightning:", error);
      }
    };
    
    (async function stormLoop() {
      while (game.clockweather?.stormActive) {
        await lightningAndThunder();
        const next = Math.floor(Math.random() * (MAX_INTERVAL - MIN_INTERVAL)) + MIN_INTERVAL;
        console.log(`Clock & Weather | ⏱️ Next lightning in ${Math.floor(next / 1000)}s`);
        await new Promise(r => setTimeout(r, next));
      }
      console.log("Clock & Weather | ☀️ Thunderstorm stopped");
    })();
  }

  stopThunderstormEffect() {
    if (game.clockweather?.stormActive) {
      game.clockweather.stormActive = false;
      console.log("Clock & Weather | 🛑 Stopping thunderstorm");
    }
  }

  async clearAllWeatherEffects() {
    console.log("Clock & Weather | Clearing ALL weather effects");
    
    if (game.modules.get("fxmaster")?.active) {
      const existingEffects = ["clockweather-rain", "clockweather-snow", "clockweather-fog", 
                               "clockweather-leaves", "clockweather-dust"];
      
      for (const effectId of existingEffects) {
        try {
          await canvas.scene.unsetFlag("fxmaster", `effects.${effectId}`);
        } catch (e) {}
      }
    }
    
    await this.clearAmbientWeatherEffects();
    
    console.log("Clock & Weather | ✓ All effects cleared");
  }

  async clearAmbientWeatherEffects() {
    if (!canvas.scene) return;
    
    this.stopThunderstormEffect();
    
    if (game.clockweather?.ambientSound) {
      try {
        game.clockweather.ambientSound.stop();
        game.clockweather.ambientSound = null;
        console.log("Clock & Weather | ✓ Stopped ambient sound");
      } catch (error) {
        console.warn("Clock & Weather | Could not stop sound:", error);
      }
    }
    
    const weatherLights = canvas.scene.lights.filter(light => 
      light.flags?.clockweather?.isWeatherEffect === true
    );
    
    if (weatherLights.length > 0) {
      const lightIds = weatherLights.map(l => l.id);
      await canvas.scene.deleteEmbeddedDocuments("AmbientLight", lightIds);
      console.log(`Clock & Weather | ✓ Removed ${lightIds.length} lights`);
    }
  }

  getWeatherEffects(weatherData) {
    const effects = [];
    const weatherCode = weatherData.rawWeatherCode || "";
    const windspeed = weatherData.windspeed;
    const windDir = weatherData.windDirection || "N";

    const directionAngles = {
      "N": 270, "NE": 315, "E": 0, "SE": 45,
      "S": 90, "SW": 135, "W": 180, "NW": 225
    };
    
    const windAngle = directionAngles[windDir] || 180;

    if (weatherCode.includes("rain") || weatherCode.includes("monsoon")) {
      let density = 0.5, speed = 1.5;
      
      if (weatherCode.includes("heavy") || weatherCode.includes("severe")) {
        density = 0.8;
        speed = 2.5;
      } else if (weatherCode.includes("light")) {
        density = 0.3;
        speed = 1.0;
      } else if (weatherCode.includes("monsoon")) {
        density = 0.9;
        speed = 2.0;
      }
      
      if (weatherData.precipitation?.intensity === 'extreme' || 
          weatherData.precipitation?.intensity === 'catastrophic') {
        density = 1.0;
        speed = 3.0;
      }
      
      effects.push({
        type: "rain",
        options: { density, speed, direction: windAngle }
      });
    }

    if (weatherCode.includes("snow") || weatherCode.includes("blizzard") || weatherCode.includes("whiteout")) {
      let density = 0.4, speed = 1.0;
      
      if (weatherCode.includes("whiteout")) {
        density = 1.0;
        speed = 3.5;
      } else if (weatherCode.includes("blizzard")) {
        density = 1.0;
        speed = 2.5;
      } else if (weatherCode.includes("heavy")) {
        density = 0.7;
        speed = 1.5;
      } else if (weatherCode.includes("light")) {
        density = 0.2;
        speed = 0.5;
      }
      
      effects.push({
        type: "snow",
        options: { density, speed, direction: windAngle }
      });
    }

    if (weatherCode.includes("fog") || weatherCode.includes("mist") || 
        weatherCode.includes("volcanic_ash")) {
      let density = 0.5;
      if (weatherCode.includes("volcanic_ash")) density = 0.7;
      
      effects.push({
        type: "fog",
        options: { density, speed: 0.3 }
      });
    }

    if (weatherCode.includes("thunder") || weatherCode.includes("typhoon") || 
        weatherCode.includes("hurricane") || weatherCode.includes("tornado")) {
      effects.push({
        type: "rain",
        options: { density: 1.0, speed: 3.0, direction: windAngle }
      });
    }

    if (weatherCode.includes("sandstorm") || weatherCode.includes("dust")) {
      let density = 0.6, speed = 2.0;
      if (weatherCode.includes("dust_devil")) {
        density = 0.4;
        speed = 2.5;
      }
      
      effects.push({
        type: "dust",
        options: { density, speed, direction: windAngle }
      });
    }

    return effects;
  }
}

Hooks.once("init", () => {
  console.log("Clock & Weather - Initializing");
  
  game.settings.register("clockweather", "currentDateTime", {
    name: "Current Date and Time",
    scope: "world",
    config: false,
    type: Object,
    default: { date: "2014-06-14", time: "00:00" }
  });

  game.settings.register("clockweather", "weatherData", {
    name: "Weather Data Cache",
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register("clockweather", "fxActive", {
    name: "Weather Effects Active State",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register("clockweather", "dailyAccumulation", {
    name: "Daily Precipitation Accumulation",
    scope: "world",
    config: false,
    type: Object,
    default: {
      snow: 0,
      rain: 0,
      ice: 0,
      hail: 0,
      startDate: "2014-06-14"
    }
  });

  game.settings.register("clockweather", "weatherFile", {
    name: "CLOCKWEATHER.Settings.WeatherFile",
    hint: "CLOCKWEATHER.Settings.WeatherFileHint",
    scope: "world",
    config: true,
    type: String,
    filePicker: "data",
    default: "modules/clockweather/weatherdata/weather.json",
    onChange: async (value) => {
      await loadWeatherData(value);
    }
  });

  game.settings.register("clockweather", "altitude", {
    name: "CLOCKWEATHER.Settings.Altitude",
    hint: "CLOCKWEATHER.Settings.AltitudeHint",
    scope: "world",
    config: true,
    type: Number,
    default: 0,
    range: {
      min: 0,
      max: 3900,
      step: 150
    }
  });

  game.settings.register("clockweather", "controlAmbientLight", {
    name: "CLOCKWEATHER.Settings.ControlLight",
    hint: "CLOCKWEATHER.Settings.ControlLightHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register("clockweather", "autoFXMaster", {
    name: "CLOCKWEATHER.Settings.AutoFXMaster",
    hint: "CLOCKWEATHER.Settings.AutoFXMasterHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register("clockweather", "enableAmbientSound", {
    name: "CLOCKWEATHER.Settings.EnableSound",
    hint: "CLOCKWEATHER.Settings.EnableSoundHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register("clockweather", "soundEnvironment", {
    name: "CLOCKWEATHER.Settings.SoundEnvironment",
    hint: "CLOCKWEATHER.Settings.SoundEnvironmentHint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      "land": "CLOCKWEATHER.Settings.OnLand",
      "sea": "CLOCKWEATHER.Settings.AtSea"
    },
    default: "land"
  });

  game.settings.register("clockweather", "enableTerrainEffects", {
    name: "CLOCKWEATHER.Settings.EnableTerrainEffects",
    hint: "CLOCKWEATHER.Settings.EnableTerrainEffectsHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register("clockweather", "resetAccumulationDaily", {
    name: "CLOCKWEATHER.Settings.ResetAccumulationDaily",
    hint: "CLOCKWEATHER.Settings.ResetAccumulationDailyHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  console.log("Clock & Weather | Settings registered");
});


async function loadWeatherData(filepath) {
  try {
    console.log("Clock & Weather | Loading weather data from:", filepath);
    
    let fullPath = filepath;
    if (!filepath.startsWith("modules/") && !filepath.startsWith("worlds/")) {
      fullPath = `modules/clockweather/weatherdata/${filepath}`;
    }
    
    const response = await fetch(fullPath);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    await game.settings.set("clockweather", "weatherData", data);
    console.log("Clock & Weather | Weather data loaded successfully");
  } catch (error) {
    console.error("Clock & Weather | Error loading weather data:", error);
    ui.notifications.error(`${game.i18n.localize("CLOCKWEATHER.ErrorLoadingWeather")}: ${error.message}`);
  }
}

Hooks.on("getSceneControlButtons", controls => {
  controls.tokens.tools.clockWeather = {
    name: "clockWeather",
    title: game.i18n.localize("CLOCKWEATHER.Title"),
    icon: "fas fa-cloud-sun",
    order: Object.keys(controls.tokens.tools).length,
    button: true,
    visible: game.user.isGM,
    onChange: () => {
      const existing = foundry.applications.instances.get("clockweather-app");
      if (existing) existing.close();
      else new ClockWeatherApp().render({force: true});
    }
  };
});

Hooks.once("ready", async () => {
  console.log("Clock & Weather | Ready hook fired");
  
  const weatherFile = game.settings.get("clockweather", "weatherFile");
  await loadWeatherData(weatherFile);
  
  if (game.modules.get("fxmaster")?.active) {
    console.log("Clock & Weather | FXMaster detected and active");
  }
  
  if (game.settings.get("clockweather", "autoFXMaster") && 
      game.settings.get("clockweather", "fxActive") && 
      game.modules.get("fxmaster")?.active &&
      game.user.isGM) {
    console.log("Clock & Weather | Auto-applying effects");
    const app = new ClockWeatherApp();
    await app.updateFXMaster();
  }
  
  console.log("Clock & Weather - Ready");
});

Hooks.on("canvasReady", async () => {
  console.log("Clock & Weather | Canvas ready");
  
  if (game.settings.get("clockweather", "fxActive") && game.user.isGM) {
    const apps = Object.values(ui.windows).filter(app => app instanceof ClockWeatherApp);
    if (apps.length > 0) {
      console.log("Clock & Weather | Reapplying effects to new scene");
      await apps[0].updateFXMaster();
    }
  }
});


Hooks.on("closeGame", async () => {
  console.log("Clock & Weather | Cleaning up on shutdown");
  
  if (game.clockweather?.stormActive) {
    game.clockweather.stormActive = false;
  }
  
  if (game.clockweather?.ambientSound) {
    try {
      game.clockweather.ambientSound.stop();
    } catch (e) {
      console.warn("Clock & Weather | Could not stop ambient sound:", e);
    }
  }
});

// ============================================
// EXPORT FOR MACROS
// ============================================

window.ClockWeatherApp = ClockWeatherApp;
