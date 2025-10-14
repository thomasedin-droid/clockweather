// Clock & Weather version 1.3.0 Build 014
// Fixed: Wind direction now shows as N, NE, E, SE etc instead of arrows
// Fixed: FXMaster API integration

console.log("Clock & Weather | Script loaded");

class ClockWeatherApp extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "clockweather-app",
      title: game.i18n.localize("CLOCKWEATHER.Title"),
      template: "modules/clockweather/templates/clockweather.html",
      width: 500,
      height: "auto",
      resizable: true,
      classes: ["clockweather"]
    });
  }

  getData() {
    const data = super.getData();
    const currentDateTime = this.getCurrentDateTime();
    const shiftNumber = this.calculateShiftNumber(currentDateTime.time);
    const shiftName = this.getShiftName(shiftNumber);
    const weatherData = this.getWeatherForDateAndShift(currentDateTime.date, shiftNumber);
    const altitude = game.settings.get("clockweather", "altitude");

    return {
      ...data,
      date: currentDateTime.date,
      time: currentDateTime.time,
      shift: shiftName,
      shiftNumber: shiftNumber,
      weather: weatherData,
      altitude: altitude,
      isGM: game.user.isGM,
      fxMasterEnabled: game.modules.get("fxmaster")?.active
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

  calculateShift(time) {
    const shiftNumber = this.calculateShiftNumber(time);
    return this.getShiftName(shiftNumber);
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
    // Beräkna sikt i meter baserat på väderförhållanden
    let baseVisibility = 10000; // 10km i klart väder
    
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
    
    // Stark vind kan minska sikten ytterligare
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
    // Vindkyleffekt (Wind Chill) - fungerar bäst under 10°C
    if (temp <= 10 && windspeed > 4.8) {
      const windKmh = windspeed * 3.6;
      const windChill = 13.12 + 0.6215 * temp - 11.37 * Math.pow(windKmh, 0.16) + 0.3965 * temp * Math.pow(windKmh, 0.16);
      return Math.round(windChill);
    }
    
    // Heat index för varmare väder (förenklad version)
    if (temp > 27 && windspeed < 3) {
      return Math.round(temp + 2);
    }
    
    // Lätt påverkan av vind vid måttliga temperaturer
    if (windspeed > 8) {
      return Math.round(temp - 1);
    }
    
    return Math.round(temp);
  }

  getWeatherForDate(date) {
    // Behåll för bakåtkompatibilitet
    const shiftNumber = this.calculateShiftNumber(this.getCurrentDateTime().time);
    return this.getWeatherForDateAndShift(date, shiftNumber);
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find('.time-advance').click(this._onAdvanceTime.bind(this));
    html.find('.save-datetime').click(this._onSaveDateTime.bind(this));
    html.find('.date-input').change(this._onDateChange.bind(this));
    html.find('.time-input').change(this._onTimeChange.bind(this));
    html.find('.altitude-slider').on('input', this._onAltitudeInput.bind(this));
    html.find('.altitude-slider').change(this._onAltitudeChange.bind(this));
    html.find('.post-to-chat').click(this._onPostToChat.bind(this));
    html.find('.toggle-fx').click(this._onToggleFX.bind(this));
  }

  async _onAdvanceTime(event) {
    event.preventDefault();
    const hours = parseInt(event.currentTarget.dataset.hours) || 0;
    
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
    
    await game.settings.set("clockweather", "currentDateTime", {
      date: newDate,
      time: newTime
    });

    this.updateAmbientLighting(newTime);
    
    // Uppdatera FXMaster om aktiverat
    if (game.settings.get("clockweather", "autoFXMaster")) {
      await this.updateFXMaster();
    }
    
    this.render();
  }

  async _onSaveDateTime(event) {
    event.preventDefault();
    ui.notifications.info(game.i18n.localize("CLOCKWEATHER.Saved"));
  }

  async _onDateChange(event) {
    const newDate = event.target.value;
    const current = this.getCurrentDateTime();
    
    await game.settings.set("clockweather", "currentDateTime", {
      date: newDate,
      time: current.time
    });
    
    if (game.settings.get("clockweather", "autoFXMaster")) {
      await this.updateFXMaster();
    }
    
    this.render();
  }

  async _onTimeChange(event) {
    const newTime = event.target.value;
    const current = this.getCurrentDateTime();
    
    await game.settings.set("clockweather", "currentDateTime", {
      date: current.date,
      time: newTime
    });
    
    this.updateAmbientLighting(newTime);
    
    if (game.settings.get("clockweather", "autoFXMaster")) {
      await this.updateFXMaster();
    }
    
    this.render();
  }

  _onAltitudeInput(event) {
    // Uppdatera visningen i realtid när slidern dras
    const newAltitude = parseInt(event.target.value) || 0;
    $(event.target).siblings('label').find('.altitude-value').text(`${newAltitude}m`);
  }

  async _onAltitudeChange(event) {
    const newAltitude = parseInt(event.target.value) || 0;
    await game.settings.set("clockweather", "altitude", newAltitude);
    this.render();
  }

  async _onToggleFX(event) {
    event.preventDefault();
    
    if (!game.modules.get("fxmaster")?.active) {
      ui.notifications.warn(game.i18n.localize("CLOCKWEATHER.FXMasterNotActive"));
      return;
    }
    
    console.log("Clock & Weather | Toggling FXMaster effects...");
    await this.updateFXMaster();
    ui.notifications.info(game.i18n.localize("CLOCKWEATHER.FXMasterUpdated"));
  }

  async _onPostToChat(event) {
    event.preventDefault();
    
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
        <p><strong>${game.i18n.localize("CLOCKWEATHER.Visibility")}:</strong> ${weatherData.visibilityText} (${weatherData.visibility}m)</p>
      </div>
    `;
    
    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker(),
      content: chatContent,
      style: CONST.CHAT_MESSAGE_STYLES.OTHER
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

    console.log("Clock & Weather | Updating FXMaster effects...");

    const currentDateTime = this.getCurrentDateTime();
    const shiftNumber = this.calculateShiftNumber(currentDateTime.time);
    const weatherData = this.getWeatherForDateAndShift(currentDateTime.date, shiftNumber);

    try {
      // Clear existing weather effects first
      console.log("Clock & Weather | Clearing existing ClockWeather effects...");
      
      // Remove previous ClockWeather effects
      const existingEffects = ["clockweather-rain", "clockweather-snow", "clockweather-fog", 
                               "clockweather-lightning", "clockweather-leaves"];
      
      for (const effectId of existingEffects) {
        Hooks.call("fxmaster.switchParticleEffect", {
          name: effectId,
          type: "off"
        });
      }

      // Get weather effects to apply
      const effects = this.getWeatherEffects(weatherData);
      console.log("Clock & Weather | Applying effects:", effects);

      // Apply new effects using FXMaster Hooks
      for (const effect of effects) {
        try {
          console.log(`Clock & Weather | Applying ${effect.type} with options:`, effect.options);
          
          Hooks.call("fxmaster.switchParticleEffect", {
            name: `clockweather-${effect.type}`,
            type: effect.type,
            options: effect.options
          });
          
        } catch (error) {
          console.error(`Clock & Weather | Error applying effect ${effect.type}:`, error);
        }
      }

      console.log("Clock & Weather | FXMaster effects updated successfully");
      
    } catch (error) {
      console.error("Clock & Weather | Error updating FXMaster:", error);
      ui.notifications.error(`FXMaster error: ${error.message}`);
    }
  }

  getWeatherEffects(weatherData) {
    const effects = [];
    const weatherCode = weatherData.rawWeatherCode || weatherData.weatherCode;
    const windspeed = weatherData.windspeed;
    const windDir = weatherData.windDirection || "N";

    console.log("Clock & Weather | Getting effects for weather:", weatherCode, "windspeed:", windspeed, "direction:", windDir);

    // Convert wind direction to angle
    // 0° = West to East (left to right)
    // 90° = South to North (bottom to top)
    // 180° = East to West (right to left)
    // 270° = North to South (top to bottom)
    const directionAngles = {
      "N": 270,    // Blowing from North (top to bottom)
      "NE": 315,   // Blowing from Northeast (top-right to bottom-left)
      "E": 0,      // Blowing from East (right to left) - wraps to 360
      "SE": 45,    // Blowing from Southeast (bottom-right to top-left)
      "S": 90,     // Blowing from South (bottom to top)
      "SW": 135,   // Blowing from Southwest (bottom-left to top-right)
      "W": 180,    // Blowing from West (left to right)
      "NW": 225    // Blowing from Northwest (top-left to bottom-right)
    };
    
    const windAngle = directionAngles[windDir] || 180;

    // Regneffekter
    if (weatherCode.includes("rain")) {
      let density = 0.5;
      let speed = 1.5;
      
      if (weatherCode.includes("heavy")) {
        density = 0.8;
        speed = 2.0;
      } else if (weatherCode.includes("light")) {
        density = 0.3;
        speed = 1.0;
      }
      
      effects.push({
        type: "rain",
        options: { 
          density: density, 
          speed: speed, 
          direction: windAngle 
        }
      });
    }

    // Snöeffekter
    if (weatherCode.includes("snow")) {
      let density = 0.4;
      let speed = 1.0;
      
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
        options: { 
          density: density, 
          speed: speed, 
          direction: windAngle 
        }
      });
    }

    // Dimma
    if (weatherCode.includes("fog") || weatherCode.includes("mist")) {
      effects.push({
        type: "fog",
        options: { 
          density: 0.5, 
          speed: 0.3 
        }
      });
    }

    // Åska - använd lightning om FXMaster har det
    if (weatherCode.includes("thunder")) {
      // FXMaster kanske inte har lightning, prova att lägga till regn med högre intensitet
      effects.push({
        type: "rain",
        options: { 
          density: 0.9, 
          speed: 2.5, 
          direction: windAngle 
        }
      });
      
      // Försök med lightning om det finns
      // Note: Vissa versioner av FXMaster kanske inte har lightning
      // effects.push({
      //   type: "lightning",
      //   options: { frequency: 5000, brightness: 0.8 }
      // });
    }

    // Vind - löv om varmt väder
    if (windspeed > 12 && weatherData.temp > 5) {
      // FXMaster kanske inte har leaves, men vi kan testa
      // effects.push({
      //   type: "leaves",
      //   options: { density: 0.3, speed: 1.5, direction: windAngle }
      // });
    }

    return effects;
  }
}

// Registrera inställningar
Hooks.once("init", () => {
  window.ClockWeatherApp = ClockWeatherApp;
  
  game.settings.register("clockweather", "currentDateTime", {
    name: "Current Date and Time",
    scope: "world",
    config: false,
    type: Object,
    default: { date: "2014-06-14", time: "00:00" }
  });

  game.settings.register("clockweather", "controlAmbientLight", {
    name: game.i18n.localize("CLOCKWEATHER.Settings.ControlLight"),
    hint: game.i18n.localize("CLOCKWEATHER.Settings.ControlLightHint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register("clockweather", "autoFXMaster", {
    name: game.i18n.localize("CLOCKWEATHER.Settings.AutoFXMaster"),
    hint: game.i18n.localize("CLOCKWEATHER.Settings.AutoFXMasterHint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    requiresReload: false
  });

  game.settings.register("clockweather", "weatherFile", {
    name: game.i18n.localize("CLOCKWEATHER.Settings.WeatherFile"),
    hint: game.i18n.localize("CLOCKWEATHER.Settings.WeatherFileHint"),
    scope: "world",
    config: true,
    type: String,
    filePicker: "data",
    default: "modules/clockweather/weatherdata/weather.json",
    onChange: async value => {
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
    name: game.i18n.localize("CLOCKWEATHER.Settings.Altitude"),
    hint: game.i18n.localize("CLOCKWEATHER.Settings.AltitudeHint"),
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

  console.log("Clock & Weather | Module initialized");
});

// Ladda väderdata
async function loadWeatherData(filepath) {
  try {
    console.log("Clock & Weather | Attempting to load weather data from:", filepath);
    
    let fullPath = filepath;
    if (!filepath.startsWith("modules/") && !filepath.startsWith("worlds/")) {
      fullPath = `modules/clockweather/weatherdata/${filepath}`;
    }
    
    console.log("Clock & Weather | Full path:", fullPath);
    
    const response = await fetch(fullPath);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    await game.settings.set("clockweather", "weatherData", data);
    console.log("Clock & Weather | Weather data loaded successfully from:", fullPath);
    ui.notifications.info(game.i18n.localize("CLOCKWEATHER.WeatherLoaded"));
  } catch (error) {
    console.error("Clock & Weather | Error loading weather data:", error);
    ui.notifications.error(`${game.i18n.localize("CLOCKWEATHER.ErrorLoadingWeather")}: ${error.message}`);
  }
}

// Lägg till knapp i Token Controls
Hooks.on("getSceneControlButtons", controls => {
  controls.tokens.tools.clockWeather = {
    name: "clockWeather",
    title: game.i18n.localize("CLOCKWEATHER.Title"),
    icon: "fas fa-cloud-sun",
    order: Object.keys(controls.tokens.tools).length,
    button: true,
    visible: game.user.isGM,
    onClick: () => {
      const existing = foundry.applications.instances.get("clockweather-app");
      if (existing) existing.close();
      else new ClockWeatherApp().render({force: true});
    }
  };
});

// Ladda väderdata när ready
Hooks.once("ready", async () => {
  const weatherFile = game.settings.get("clockweather", "weatherFile");
  await loadWeatherData(weatherFile);
  
  // Log FXMaster status
  if (game.modules.get("fxmaster")?.active) {
    console.log("Clock & Weather | FXMaster detected and active");
    console.log("Clock & Weather | FXMASTER API:", window.FXMASTER);
  }
  
  // Applicera FXMaster om aktiverat och modulen finns
  if (game.settings.get("clockweather", "autoFXMaster") && game.modules.get("fxmaster")?.active) {
    const app = new ClockWeatherApp();
    await app.updateFXMaster();
  }
  
  console.log("Clock & Weather | Ready");
});