Clock & Weather module for Foundry VTT. This module is agnostic and works with any Foundry system.

Features:
Date/Time
  - Date and 24h-clock
  - jump 4 hour shifts back and forth, and +1 hour
Light:
  - After 18:00 the ambient scene light becomes darker and darker.
  - Lightning flashes during thunderstorms.
Weather:
  - Weather is pre-generated from a start date to a end date. There is a change of wether each shift.
  - Weather contains:
      - Weather conditions
      - Wind condition in text, wind speed, wind direction
      - Temperature with percepted temperature in C.
      - Visibility in text and meter
	  - Precipitation during different rain and snow conditions. The system using metric units and imperial will come up in future updates
Controls:
  - Toggle visual and sound FX.
  - Save Date and Time,
  - Change altitude above sea level.
Configure Settings:
  - Enable/disable ambient light. When this is disabled, you don't see the ambient light change when the time change.
  - Enable/disable weather effects from FXMaster.
  - Enable/disable ambient sound.
  - Change sound environment for Land and Sea.
  - Select weather data file, See the installation instructions.
  - Change default altitude.


Features in version 1.3.4
  None
  Slimer UI 

Installation instructions: 
   - For Foundry Users, because this module is not an official module you have to download it manually and install the module in your Modules Folder and reload Foundry
   - For the most convinient use of the weather.json file, i recomend that you create a folder in your world folder called "weatherdata".
     Put you weather.json files in there and select the file you want to use at the moment from the Configure Settings -> Clock & Weather


