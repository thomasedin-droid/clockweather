// Clock & Weather version 2.0.0 Build 001
// Major upgrade: ApplicationV2, Foundry v13+ compatible
// Removed all deprecated APIs

console.log("Clock & Weather | Script loaded (v2.0.0)");

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
        width: 500,
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

    return {
      date: currentDateTime.date,
      time: currentDateTime.time,
      shift: shiftName,
      shiftNumber: shiftNumber,
      weather: weatherData,
      altitude: altitude,
      isGM: game.user.isGM,
      fxMasterEnabled: game.modules.get("fxmaster")?.active,
      fxActive: fxActive
    };
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
        visibility: 10000
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
        visibility: 10000
      };
    }

    const altitude = game.settings.get("clockweather", "altitude");
    const adjustedTemp = shiftData.temp - Math.round(altitude / 150);
    const feelsLike = this.calculateFeelsLike(adjustedTemp, shiftData.windspeed);
    const visibility = this.calculateVisibility(shiftData.weatherCode, shiftData.windspeed);
    const windDir = shiftData.windDirection || "N";
    
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
      rawWeatherCode: shiftData.weatherCode
    };
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
        baseVisibility = 1000;
        break;
      case "heavy_rain":
      case "heavy_snow":
      case "blizzard":
        baseVisibility = 200;
        break;
      case "thunderstorm":
        baseVisibility = 2000;
        break;
    }
    
    if (windspeed > 15) {
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
    
    console.log("Clock & Weather | _onRender called");
    console.log("Clock & Weather | Element:", html);
    
    // Store app reference
    const app = this;
    
    // Time advance buttons (using CLASS selector, not data-action)
    const advanceButtons = html.querySelectorAll('.time-advance');
    console.log("Clock & Weather | Found advance buttons:", advanceButtons.length);
    
    advanceButtons.forEach(btn => {
      console.log("Clock & Weather | Attaching listener to button:", btn, "hours:", btn.dataset.hours);
      btn.addEventListener('click', async (e) => {
        console.log("Clock & Weather | BUTTON CLICKED!");
        e.preventDefault();
        e.stopPropagation();
        const hours = parseInt(btn.dataset.hours) || 0;
        console.log("Clock & Weather | Advance time button clicked:", hours);
        await app._advanceTime(hours);
      });
    });
    
    // Date input (using CLASS selector)
    const dateInput = html.querySelector('.date-input');
    console.log("Clock & Weather | Found date input:", dateInput);
    if (dateInput) {
      dateInput.addEventListener('change', async (e) => {
        console.log("Clock & Weather | Date changed:", e.target.value);
        await app._changeDate(e.target.value);
      });
    }
    
    // Time input (using CLASS selector)
    const timeInput = html.querySelector('.time-input');
    console.log("Clock & Weather | Found time input:", timeInput);
    if (timeInput) {
      timeInput.addEventListener('change', async (e) => {
        console.log("Clock & Weather | Time changed:", e.target.value);
        await app._changeTime(e.target.value);
      });
    }
    
    // Altitude slider (using CLASS selector)
    const altitudeSlider = html.querySelector('.altitude-slider');
    console.log("Clock & Weather | Found altitude slider:", altitudeSlider);
    if (altitudeSlider) {
      // Real-time display update
      altitudeSlider.addEventListener('input', (e) => {
        const newAltitude = parseInt(e.target.value) || 0;
        const label = html.querySelector('.altitude-value');
        if (label) label.textContent = `${newAltitude}m`;
      });
      
      // Save on change
      altitudeSlider.addEventListener('change', async (e) => {
        const newAltitude = parseInt(e.target.value) || 0;
        console.log("Clock & Weather | Altitude changed:", newAltitude);
        await game.settings.set("clockweather", "altitude", newAltitude);
        app.render();
      });
    }
    
    // Post to chat button (using CLASS selector)
    const chatBtn = html.querySelector('.post-to-chat');
    console.log("Clock & Weather | Found chat button:", chatBtn);
    if (chatBtn) {
      chatBtn.addEventListener('click', async (e) => {
        console.log("Clock & Weather | CHAT BUTTON CLICKED!");
        e.preventDefault();
        e.stopPropagation();
        console.log("Clock & Weather | Post to chat clicked");
        await app._postToChat();
      });
    }
    
    // Toggle FX button (using CLASS selector)
    const fxBtn = html.querySelector('.toggle-fx');
    console.log("Clock & Weather | Found FX button:", fxBtn);
    if (fxBtn) {
      fxBtn.addEventListener('click', async (e) => {
        console.log("Clock & Weather | FX BUTTON CLICKED!");
        e.preventDefault();
        e.stopPropagation();
        console.log("Clock & Weather | Toggle FX clicked");
        await app._toggleFX();
      });
    }
    
    // Save button (using CLASS selector)
    const saveBtn = html.querySelector('.save-datetime');
    console.log("Clock & Weather | Found save button:", saveBtn);
    if (saveBtn) {
      saveBtn.addEventListener('click', async (e) => {
        console.log("Clock & Weather | SAVE BUTTON CLICKED!");
        e.preventDefault();
        e.stopPropagation();
        ui.notifications.info(game.i18n.localize("CLOCKWEATHER.Saved"));
      });
    }
    
    console.log("Clock & Weather | Finished attaching listeners");
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
    } else if (newHours < 0) {
      const date = new Date(current.date);
      date.setDate(date.getDate() - Math.ceil(Math.abs(newHours) / 24));
      newDate = date.toISOString().split('T')[0];
      newHours = ((newHours % 24) + 24) % 24;
    }

    const newTime = `${String(newHours).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    
    console.log("Clock & Weather | New date/time:", newDate, newTime);
    
    await game.settings.set("clockweather", "currentDateTime", {
      date: newDate,
      time: newTime
    });

    this.updateAmbientLighting(newTime);
    
    if (game.settings.get("clockweather", "autoFXMaster") && game.settings.get("clockweather", "fxActive")) {
      await this.updateFXMaster();
    }
    
    this.render();
  }

  async _changeDate(newDate) {
    console.log("Clock & Weather | _changeDate called with", newDate);
    
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
    console.log("Clock & Weather | _changeTime called with", newTime);
    
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
    console.log("Clock & Weather | _toggleFX called");
    
    if (!game.modules.get("fxmaster")?.active) {
      ui.notifications.warn(game.i18n.localize("CLOCKWEATHER.FXMasterNotActive"));
      return;
    }
    
    const isActive = game.settings.get("clockweather", "fxActive");
    
    console.log("Clock & Weather | Current FX state:", isActive);
    
    if (isActive) {
      console.log("Clock & Weather | Turning OFF weather effects...");
      await this.clearAllWeatherEffects();
      await game.settings.set("clockweather", "fxActive", false);
      ui.notifications.info(game.i18n.localize("CLOCKWEATHER.FXMasterDisabled"));
    } else {
      console.log("Clock & Weather | Turning ON weather effects...");
      await this.updateFXMaster();
      await game.settings.set("clockweather", "fxActive", true);
      ui.notifications.info(game.i18n.localize("CLOCKWEATHER.FXMasterEnabled"));
    }
    
    this.render();
  }

  async _postToChat() {
    console.log("Clock & Weather | _postToChat called");
    
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
      // Clear existing particle effects
      const existingEffects = ["clockweather-rain", "clockweather-snow", "clockweather-fog", 
                               "clockweather-leaves", "clockweather-dust"];
      
      for (const effectId of existingEffects) {
        try {
          await canvas.scene.unsetFlag("fxmaster", `effects.${effectId}`);
        } catch (e) {
          // Effect might not exist
        }
      }

      // Get and apply new effects
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

      // Handle ambient sounds and lights
      if (game.settings.get("clockweather", "enableAmbientSound")) {
        await this.updateAmbientWeatherEffects(weatherData);
      } else {
        await this.clearAmbientWeatherEffects();
      }

      console.log("Clock & Weather | === updateFXMaster COMPLETE ===");
      
    } catch (error) {
      console.error("Clock & Weather | Error updating FXMaster:", error);
      foundry.applications.api.DialogV2.prompt({
        window: { title: "Error" },
        content: `<p>FXMaster error: ${error.message}</p>`,
        ok: { label: "OK" }
      });
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
    
    // Sea environment overrides
    if (environment === "sea") {
      if (windspeed > 19 || weatherCode.includes("storm") || weatherCode.includes("typhoon")) {
        soundFile = "modules/clockweather/sounds/large_waves.ogg";
      } else if (windspeed > 7 && windspeed < 19) {
        soundFile = "modules/clockweather/sounds/waves_02.ogg";
      } else if (!weatherCode.includes("sandstorm") && !weatherCode.includes("dust")) {
        soundFile = "modules/clockweather/sounds/waves.ogg";
      }
    }
    
    // Start ambient sound
    if (soundFile) {
      console.log(`Clock & Weather | Starting ambient sound: ${soundFile}`);
      try {
        const ambientSound = await foundry.audio.AudioHelper.play(
          { src: soundFile, volume: 0.3, loop: true },
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
    const THUNDER_VOLUME = 0.7;
    
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

    // Rain
    if (weatherCode.includes("rain")) {
      let density = 0.5, speed = 1.5;
      
      if (weatherCode.includes("heavy")) {
        density = 0.8;
        speed = 2.0;
      } else if (weatherCode.includes("light")) {
        density = 0.3;
        speed = 1.0;
      }
      
      effects.push({
        type: "rain",
        options: { density, speed, direction: windAngle }
      });
    }

    // Snow
    if (weatherCode.includes("snow")) {
      let density = 0.4, speed = 1.0;
      
      if (weatherCode.includes("blizzard")) {
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

    // Fog
    if (weatherCode.includes("fog") || weatherCode.includes("mist")) {
      effects.push({
        type: "fog",
        options: { density: 0.5, speed: 0.3 }
      });
    }

    // Thunderstorm
    if (weatherCode.includes("thunder")) {
      effects.push({
        type: "rain",
        options: { density: 0.9, speed: 2.5, direction: windAngle }
      });
    }

    return effects;
  }
}

// Register settings
Hooks.once("init", () => {
  console.log("Clock & Weather | Initializing v2.0.0");
  
  game.settings.register("clockweather", "currentDateTime", {
    name: "Current Date and Time",
    scope: "world",
    config: false,
    type: Object,
    default: { date: "2014-06-14", time: "00:00" }
  });

  game.settings.register("clockweather", "fxActive", {
    name: "Weather Effects Active State",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
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

  game.settings.register("clockweather", "weatherData", {
    name: "Weather Data Cache",
    scope: "world",
    config: false,
    type: Object,
    default: {}
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

  console.log("Clock & Weather | Settings registered");
});

// Load weather data
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
    ui.notifications.info(game.i18n.localize("CLOCKWEATHER.WeatherLoaded"));
  } catch (error) {
    console.error("Clock & Weather | Error loading weather data:", error);
    ui.notifications.error(`${game.i18n.localize("CLOCKWEATHER.ErrorLoadingWeather")}: ${error.message}`);
  }
}

// Scene control button
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

// Cleanup on scene change
Hooks.on("canvasReady", async () => {
  console.log("Clock & Weather | Canvas ready - checking for active effects");
  
  // If FX is active, reapply effects to new scene
  if (game.settings.get("clockweather", "fxActive") && game.user.isGM) {
    const apps = Object.values(ui.windows).filter(app => app instanceof ClockWeatherApp);
    if (apps.length > 0) {
      console.log("Clock & Weather | Reapplying effects to new scene");
      await apps[0].updateFXMaster();
    }
  }
});

// Cleanup on world shutdown
Hooks.on("closeGame", async () => {
  console.log("Clock & Weather | Cleaning up on shutdown");
  
  if (game.clockweather?.stormActive) {
    game.clockweather.stormActive = false;
  }
  
  if (game.clockweather?.ambientSound) {
    try {
      game.clockweather.ambientSound.stop();
    } catch (e) {}
  }
});

// Ready hook
Hooks.once("ready", async () => {
  const weatherFile = game.settings.get("clockweather", "weatherFile");
  await loadWeatherData(weatherFile);
  
  if (game.modules.get("fxmaster")?.active) {
    console.log("Clock & Weather | FXMaster detected");
  }
  
  // Auto-apply effects if enabled
  if (game.settings.get("clockweather", "autoFXMaster") && 
      game.settings.get("clockweather", "fxActive") && 
      game.modules.get("fxmaster")?.active &&
      game.user.isGM) {
    console.log("Clock & Weather | Auto-applying effects");
    const app = new ClockWeatherApp();
    await app.updateFXMaster();
  }
  
  console.log("Clock & Weather | Ready (v2.0.0)");
});

// Export for use in macros
window.ClockWeatherApp = ClockWeatherApp;