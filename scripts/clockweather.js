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
      isGM: game.user.isGM
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
        windspeed: 0,
        temp: 0,
        feelsLike: 0
      };
    }

    const shiftData = dayData.shifts.find(s => s.shift === shiftNumber);
    
    if (!shiftData) {
      return {
        weatherCode: game.i18n.localize("CLOCKWEATHER.NoData"),
        windCode: "",
        windspeed: 0,
        temp: 0,
        feelsLike: 0
      };
    }

    const altitude = game.settings.get("clockweather", "altitude");
    const adjustedTemp = shiftData.temp - Math.round(altitude / 150);
    const feelsLike = this.calculateFeelsLike(adjustedTemp, shiftData.windspeed);
// change Weather to Weathertype and Wind to Windtype
    return {
      weatherCode: game.i18n.localize(`CLOCKWEATHER.Weathertype.${shiftData.weatherCode}`) || shiftData.weatherCode,
      windCode: game.i18n.localize(`CLOCKWEATHER.Windtype.${shiftData.windCode}`) || shiftData.windCode,
      windspeed: shiftData.windspeed,
      temp: adjustedTemp,
      feelsLike: feelsLike
    };
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
        <p><strong>${game.i18n.localize("CLOCKWEATHER.Wind")}:</strong> ${weatherData.windCode} (${weatherData.windspeed} m/s)</p>
        <p><strong>${game.i18n.localize("CLOCKWEATHER.Temperature")}:</strong> ${weatherData.temp}°C</p>
        <p><strong>${game.i18n.localize("CLOCKWEATHER.FeelsLike")}:</strong> ${weatherData.feelsLike}°C</p>
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
  
  console.log("Clock & Weather | Ready");
});