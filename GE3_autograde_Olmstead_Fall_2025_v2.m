
% GE3 Autograder: Grades AE210 Jet11 Excel submissions, logs feedback, and optionally exports Blackboard-compatible scores.
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%%%%%% IMPORTANT NOTE: BLACKBOARD DOWNLOAD FILE NAMES ARE TOO LONG TO %%%%%
%%%%%% UNPACK THESE FILES IN ANY USER FOLDER. CREATE A C:/GE3FILES OR %%%%%
%%%%%% SIMILAR FOLDER TO REDUCE THE TOTAL FILE PATH NAME PRIOR TO READING %
%%%%%% THE FILES WITH THIS TOOL. %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

%--------------------------------------------------------------------------
% AE210 GE3 Autograder Script – Fall 2025
% Version: v2.0
%
% Description:
% This script automates grading for AE210 preliminary Design Project 
% submissions (GE3) by processing Jet11 Excel files (*.xlsm). It evaluates 
% multiple design criteria, generates detailed feedback, and outputs both a
% summary log and an optional Blackboard-compatible grade import file.
%
% Key Features:
% - Supports both single-file and batch-folder grading via GUI
% - Parallel-safe execution using MATLAB's parpool
% - Robust Excel reading with fallback for missing data
% - Detailed feedback log per cadet with scoring breakdown
% - Optional export to Blackboard offline grade format (SMART_TEXT)
% - Histogram visualization of score distribution
%
% Inputs:
% - User-selected Excel file or folder of files
%
% Outputs:
% - Text log file: textout_<timestamp>.txt
% - Histogram of scores
% - Optional Blackboard CSV: GE3_Blackboard_Offline_<timestamp>.csv
%
% Embedded Functions:
% - gradeCadet: Grades a single cadet's file and returns score and feedback
% - loadAllJet11Sheets: Loads all required sheets from a Jet11 Excel file
% - safeReadMatrix: Robustly reads numeric data from Excel, with fallback to readcell
% - cell2sub: Converts Excel cell references (e.g., 'G4') to row/col indices
% - sub2excel: Converts row/col indices back to Excel cell references
% - logf: Appends formatted text to a log string
% - selectRunMode: GUI for selecting single file or folder mode
% - promptAndGenerateBlackboardCSV: Dialog + export to Blackboard SMART_TEXT format
%
% Author: Lt Col Dell Olmstead, based on work by Capt Carol Bryant and Capt Anna Mason
% Last Updated: 22 Jul 2025
%--------------------------------------------------------------------------
clear; close all; clc;


%% Select run mode: single file or folder, start parallel pool if folder
[mode, selectedPath] = selectRunMode();
tic
if strcmp(mode, 'cancelled')
    disp('Operation cancelled by user.');
    return;
elseif strcmp(mode, 'single')
    folderAnalyzed = fileparts(selectedPath);
    files = dir(selectedPath);  % single file
elseif strcmp(mode, 'folder')
    % Ensure a process-based parallel pool is active
    poolobj = gcp('nocreate'); % Get the current pool, if any
    if isempty(poolobj)
        % Create a new local pool, ensuring process-based if possible
        try
            p = parpool('local'); % Try the simplest form first
        catch ME
            if contains(ME.message, 'ExecutionMode') % Check for specific error message
                p = parpool('local', 'ExecutionMode', 'Processes'); % Use ExecutionMode if supported
            else
                rethrow(ME); % If it's a different error, re-throw it
            end
        end

        if ~isempty(p)
            if isa(p, 'parallel.ThreadPool')
                warning('Created a thread-based pool despite requesting "local". Attempting to delete and recreate as process-based.');
                delete(p);
                parpool('local', 'ExecutionMode', 'Processes'); % Explicitly use ExecutionMode
            elseif isa(p, 'parallel.Pool')
                fprintf('Successfully created a process-based local parallel pool.\n');
            end
        end
    elseif isa(poolobj, 'parallel.ThreadPool')
        % If an existing pool is thread-based, delete it and create a process-based one
        warning('Existing parallel pool is thread-based. Deleting and creating a process-based local pool.');
        delete(poolobj);
        parpool('local', 'ExecutionMode', 'Processes'); % Explicitly use ExecutionMode
    elseif isa(poolobj, 'parallel.Pool')
        fprintf('A process-based local parallel pool is already running.\n');
    end
    folderAnalyzed = selectedPath;
    files = [dir(fullfile(folderAnalyzed, '*.xlsm')); dir(fullfile(folderAnalyzed, '*.xlsx')); dir(fullfile(folderAnalyzed, '*.xls'))];
else
    error('Unknown mode selected.');
end


%% %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%%%%%%%%%% Iterate through cadets %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
points = 10*ones(numel(files),1);  % Initialize points for each file
feedback = cell(1,numel(files));

fprintf('Reading %d files\n', numel(files));

if strcmp(mode, 'folder')
    % Combined parallel read + grade

    parfor cadetIdx = 1:numel(files)
        filename = fullfile(folderAnalyzed, files(cadetIdx).name);
        try
            [pt, fb] = gradeCadet(filename);
            points(cadetIdx) = pt;
            feedback{cadetIdx} = fb;
        catch
            points(cadetIdx) = NaN;
            feedback{cadetIdx} = sprintf('Error reading or grading file: %s', files(cadetIdx).name);
        end
    end

else %       %%% Use the below code to run a single cadet

    filename = fullfile(folderAnalyzed, files(1).name);
    [points, feedback{1}] = gradeCadet(filename);

end


%% Set up log file
timestamp = char(datetime('now', 'Format', 'yyyy-MM-dd_HH-mm-ss'));
logFilePath = fullfile(folderAnalyzed, ['textout_', timestamp, '.txt']);
finalout = fopen(logFilePath,'w');

% Log file header
fprintf(finalout, 'GE2 Autograder Log\n');
fprintf(finalout, 'Script Name: %s.m\n', mfilename);
fprintf(finalout, 'Run Date: %s\n', string(datetime('now', 'Format', 'yyyy-MM-dd HH:mm:ss')));
fprintf(finalout, 'Analyzed Folder: %s\n', folderAnalyzed);
fprintf(finalout, 'Files to Analyze (%d):\n', numel(files));
for i = 1:numel(files)
    fprintf(finalout, '  - %s\n', files(i).name);
end
fprintf(finalout, '\n');

%% Concatenate all outputs into one text file and write it.
allLogText = strjoin(string(feedback(:)), '\n\n');
fprintf(finalout, '%s', allLogText); % Write accumulated log text
fclose(finalout);

% Export MATLAB baseline JSON for web test runner (save to folderAnalyzed)
try
    entries = struct('file', cell(length(files), 1), 'logLines', cell(length(files), 1));
    for ii = 1:length(files)
        entries(ii).file = files(ii).name;
        lines = regexp(string(feedback{ii}), '\r?\n', 'split')'; % split into lines
        lines = lines(~cellfun(@isempty, lines)); % drop blank lines
        entries(ii).logLines = cellstr(lines); % ensure a cell array of char vectors
    end

    % Force array JSON even for a single entry and pretty-print for readability
    defaultName = fullfile(folderAnalyzed, 'matlab_expected.json');
    jsonText = jsonencode(entries, 'PrettyPrint', true);
    txt = strtrim(jsonText);
    if ~startsWith(txt, "[")
        jsonText = "[" + jsonText + "]"; % wrap singleton object in an array
    end

    fid = fopen(defaultName, 'w');
    if fid ~= -1
        fwrite(fid, jsonText, 'char');
        fclose(fid);
        fprintf('Baseline JSON exported to: %s\n', defaultName);
    else
        fprintf('Could not write baseline JSON.\n');
    end
catch ME
    fprintf('Could not export baseline JSON: %s\n', ME.message);
end


%% Prompt user to export Blackboard CSV

promptAndGenerateBlackboardCSV(folderAnalyzed, files, points, feedback, timestamp);



%%  Create a histogram with 10 bins
figure;  % Open a new figure window
histogram(points, 10);
% Add labels and title
xlabel('Scores');
ylabel('Count');
title('Distribution of Scores');

duration=toc;
fprintf('Average time was %0.1f seconds per cadet\n',duration/numel(files))
%% Give link to the log file
fprintf('Open the output file here:\n <a href="matlab:system(''notepad %s'')">%s</a>\n', logFilePath, logFilePath);




%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%%%%%%Embedded functions%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

% This is the main code that does all the evaluations. It is here so
% it can be called using a for loop for one file, and a parfor loop for
% many files.
function [pt, fb] = gradeCadet(filename) % Read the sheet

sheets = loadAllJet11Sheets(filename);

Aero = sheets.Aero;
Miss = sheets.Miss;
Main = sheets.Main;
Consts = sheets.Consts;
Gear = sheets.Gear;
Geom = sheets.Geom;


% Initialize local variables
pt = 10;  % Start with full score
logText = ""; % create the blank logtext for this entry analysis

% filename = fullfile(folderAnalyzed, files(cadetnum).name);
% fprintf('%s started\n', files(cadetnum).name);
[~, name, ext] = fileparts(filename);
logText = logf(logText, '%s\n', [name, ext]);

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%% --- Aero Tab Check (2 points) --- %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% Logic: The aero check cells for programming are a rigid number so any
% changes to the aircraft will create a mismatch on those initial check
% numbers indicating sufficient success. If less than all are incorrect
% (likely didn't get coded) then deduct 1 point per error, maximum of 2 points.

flag = 0;
if isequal(Aero(3,7), Aero(4,7)), flag = flag + 1; end % Check cells G3 and G4 to make sure they no longer match indicating a live cell G3
if isequal(Aero(10,7), Aero(11,7)), flag = flag + 1; end
if isequal(Aero(15,1), Aero(16,1)), flag = flag + 1; end

pointdeduction = min(2, flag);  % Deduct 1 point per error, max 2
if pointdeduction > 0
    pt = pt - pointdeduction;
    logText = logf(logText, '-%d point Mismatch in Aero A15, G3, and G10  \n', pointdeduction);
end
%     fprintf('Aero Check Complete\n')
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%% --- Mission Table Checks From Attachment 1 (0 points)%%%%%%%%%%%%%
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% Logic: compare to the RFP Attachment 1 and ensure all specified
% parameters are met. Most legs have inequalities, so each leg is an
% independent logical comparison. The legs are not all of the legs in
% Jet11, so it must be parsed to compare the correct legs.

MissionInputFailed = 0;
missionTolAlt = 10;
missionTolMach = 0.05;
missionTolTime = 0.1;
missionTolDist = 0.5;
MissionArray = Main(33:44, 11:25); % J32:Y44
ConstraintsMach = Main(4, 21); % Constraint supercruise Mach cell

% Column mapping for legs 1–9: K, L, M, N, P, R, S, V, W
%K=Takeoff	Accel	Climb	Cruise	Patrol	Supercruise	Patrol	Combat	Supercruise	Patrol	Climb	Cruise 	W=Loiter

colIdx = [1, 2, 3, 4, 6, 8, 9, 12, 13];

% Extract mission data
alt = MissionArray(1, colIdx);
mach = MissionArray(3, colIdx);
ab = MissionArray(4, colIdx);
dist = MissionArray(6, colIdx);
time = MissionArray(7, colIdx);

%%%%%%%%%%%%%%% Leg 1: Preflight & Takeoff
if abs(alt(1)) > missionTolAlt || abs(ab(1) - 100) > missionTolAlt
    logText = logf(logText, 'Leg 1: Altitude must be 0 and AB = 100 (found alt=%.1f, AB=%.1f)\n', alt(1), ab(1));
    MissionInputFailed = MissionInputFailed + 1;
end

%%%%%%%%%%%%%%% Leg 2: Acceleration to climb
if ~(alt(2) >= alt(1) - missionTolAlt && alt(2) <= alt(3) + missionTolAlt)
    logText = logf(logText, 'Leg 2: Altitude must be between Leg 1 and Leg 3 (found alt2=%.1f, alt1=%.1f, alt3=%.1f)\n', alt(2), alt(1), alt(3));
    MissionInputFailed = MissionInputFailed + 1;
end
if ~(mach(2) >= mach(1) - missionTolMach && mach(2) <= mach(3) + missionTolMach)
    logText = logf(logText, 'Leg 2: Mach must be between Leg 1 and Leg 3 (found mach2=%.2f, mach1=%.2f, mach3=%.2f)\n', mach(2), mach(1), mach(3));
    MissionInputFailed = MissionInputFailed + 1;
end
if abs(ab(2)) > missionTolAlt
    logText = logf(logText, 'Leg 2: AB must be 0 (found AB=%.1f)\n', ab(2));
    MissionInputFailed = MissionInputFailed + 1;
end

%%%%%%%%%%%%%%% Leg 3: Climb to cruise
if alt(3) < 35000 - missionTolAlt || abs(mach(3) - 0.9) > missionTolMach || abs(ab(3)) > missionTolAlt
    logText = logf(logText, 'Leg 3: Must be ≥35,000 ft, Mach = 0.9, AB = 0 (found alt=%.1f, mach=%.2f, AB=%.1f)\n', alt(3), mach(3), ab(3));
    MissionInputFailed = MissionInputFailed + 1;
end

%%%%%%%%%%%%%%% Leg 4: Subsonic cruise
if alt(4) < 35000 - missionTolAlt || abs(mach(4) - 0.9) > missionTolMach || abs(ab(4)) > missionTolAlt
    logText = logf(logText, 'Leg 4: Must be ≥35,000 ft, Mach = 0.9, AB = 0 (found alt=%.1f, mach=%.2f, AB=%.1f)\n', alt(4), mach(4), ab(4));
    MissionInputFailed = MissionInputFailed + 1;
end

%%%%%%%%%%%%%%% Leg 5: Supercruise to target
if alt(5) < 35000 - missionTolAlt || abs(mach(5) - ConstraintsMach) > missionTolMach || abs(ab(5)) > missionTolAlt || dist(5) < 150 - missionTolDist
    logText = logf(logText, 'Leg 5: Must be ≥35,000 ft, Mach = Contraints block Supercruise Mach (cell U4), AB = 0, Distance ≥ 150 nm (found alt=%.1f, mach=%.2f, AB=%.1f, dist=%.1f)\n', alt(5), mach(5), ab(5), dist(5));
    MissionInputFailed = MissionInputFailed + 1;
end

%%%%%%%%%%%%%%% Leg 6: Combat
if abs(alt(6) - 30000) > missionTolAlt || mach(6) < 1.2 - missionTolMach || abs(ab(6) - 100) > missionTolAlt || time(6) < 2 - missionTolTime
    logText = logf(logText, 'Leg 6: Must be ≥30,000 ft, Mach ≥ 1.2, AB = 100, Time ≥ 2 min (found alt=%.1f, mach=%.2f, AB=%.1f, time=%.2f)\n', alt(6), mach(6), ab(6), time(6));
    MissionInputFailed = MissionInputFailed + 1;
end

%%%%%%%%%%%%%%% Leg 7: Supercruise egress
if alt(7) < 35000 - missionTolAlt || abs(mach(7) - ConstraintsMach) > missionTolMach || abs(ab(7)) > missionTolAlt || dist(7) < 150 - missionTolDist
    logText = logf(logText, 'Leg 7: Must be ≥35,000 ft, Mach = Contraints block Supercruise Mach (cell U4), AB = 0, Distance ≥ 150 nm (found alt=%.1f, mach=%.2f, AB=%.1f, dist=%.1f)\n', alt(7), mach(7), ab(7), dist(7));
    MissionInputFailed = MissionInputFailed + 1;
end

%%%%%%%%%%%%%%% Leg 8: Subsonic return cruise
if alt(8) < 35000 - missionTolAlt || abs(mach(8) - 0.9) > missionTolMach || abs(ab(8)) > missionTolAlt
    logText = logf(logText, 'Leg 8: Must be ≥35,000 ft, Mach = 0.9, AB = 0 (found alt=%.1f, mach=%.2f, AB=%.1f)\n', alt(8), mach(8), ab(8));
    MissionInputFailed = MissionInputFailed + 1;
end

%%%%%%%%%%%%%%% Leg 9: Descent
if abs(alt(9) - 10000) > missionTolAlt || abs(mach(9) - 0.4) > missionTolMach || abs(ab(9)) > missionTolAlt || abs(time(9) - 20) > missionTolTime
    logText = logf(logText, 'Leg 9: Must be 10,000 ft, Mach = 0.4, AB = 0, Time = 20 min (found alt=%.1f, mach=%.2f, AB=%.1f, time=%.2f)\n', alt(9), mach(9), ab(9), time(9));
    MissionInputFailed = MissionInputFailed + 1;
end

%%%%%%%%%%%%%%% Final deduction
if MissionInputFailed > 0
    %         pt = pt - 1;
    logText = logf(logText, 'There is an error with your inputs to the OCA Mission that must be corrected. \n');
end
%%%%%%%%%

%     fprintf('Mission Analysis Check is Complete\n')
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%% Mission Analysis (T > D), takeoff roll (1 point max)
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

thrust_drag = Miss(48:49, 3:14); % C:N
thrustShort = thrust_drag(2, :) <= thrust_drag(1, :);
thrustFailures = sum(thrustShort);
if thrustFailures > 0
    pt = pt -1;
    logText = logf(logText,'-1 Point Not enough thrust: Tavailable <= D for %d mission segment(s)\n', thrustFailures);
else
    takeoff_d = Main(38, 11); % K38
    takeoff_rq = Main(12, 24); % X12
    if takeoff_d > takeoff_rq
        logText = logf(logText,'-1 Point Too long for takeoff roll\n');
        pt = pt - 1;
    end
end

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%% Constraint Compliance Checks from RFP Attachment 2 (1 point)
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% This checks radius, payload, TO distance, Landing distance
% independently, and then assesses all the criteria in the constraint
% table to ensure all meet threshold, and give feedback if failing or
% meeting objective.
constraintInputsFailed = 0;
fuel_available_beta = Main(18, 15);
fuel_capacity_beta = Main(15, 15);
if ~isnan(fuel_available_beta) && ~isnan(fuel_capacity_beta) && fuel_capacity_beta ~= 0
    betaDefault = 1 - fuel_available_beta/(2*fuel_capacity_beta);
else
    betaDefault = 0.87620980519917;
end
tolMach = 0.01;
tolAlt = 1;
tolN = 0.05;
tolAb = 1;
tolPs = 1;
tolBeta = 0.02;
tolCdx = 0.0001;
tolDist = 0.05;
distTol = tolDist;
addConstraintSummary = false;

% Mission Radius (Y37)
radius = Main(37, 25);
if radius < 375 - tolDist
    logText = logf(logText, 'Mission radius below threshold (375 nm): %.1f nm\n', radius);
    constraintInputsFailed=constraintInputsFailed+1;
elseif radius >= 410 - tolDist
    logText = logf(logText, 'Mission radius meets objective (410 nm): %.1f nm\n', radius);
else
    %         logText = logf(logText, 'Mission radius meets threshold: %.1f\n', radius);
end
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% Weapons Payload (AB3 = AIM-120s, AB4 = AIM-9s)
aim120Raw = Main(3, 28); % AB3
aim9Raw = Main(4, 28);   % AB4
payloadTol = 0.01;
aim120 = NaN; aim9 = NaN;
if isnan(aim120Raw)
    aim120Raw = 0;
end
if isnan(aim9Raw)
    aim9Raw = 0;
end
if abs(aim120Raw - round(aim120Raw)) <= payloadTol
    aim120 = round(aim120Raw);
end
if abs(aim9Raw - round(aim9Raw)) <= payloadTol
    aim9 = round(aim9Raw);
end
if isnan(aim120) || isnan(aim9)
    logText = logf(logText, 'Payload counts must be integers for AIM-120s and AIM-9s.\n');
    constraintInputsFailed=constraintInputsFailed+1;
elseif aim120 < 8
    logText = logf(logText, 'Fewer than 8 AIM-120s: %d\n', aim120);
    constraintInputsFailed=constraintInputsFailed+1;
elseif aim9 >= 2
    logText = logf(logText, 'Payload meets objective: %d AIM-120s + %d AIM-9s\n', aim120, aim9);
else
    %         logText = logf(logText, 'Payload meets threshold: %d AIM-120s\n', aim120);
end
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% Takeoff Distance (X13)
takeoff_dist = Main(12, 24);
if takeoff_dist > 3000 + tolDist
    logText = logf(logText, 'Takeoff distance exceeds threshold (3000 ft): %.0f ft\n', takeoff_dist);
    constraintInputsFailed=constraintInputsFailed+1;
end
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% Landing Distance (X14)
landing_dist = Main(13, 24);
if landing_dist > 5000 + tolDist
    logText = logf(logText, 'Landing distance exceeds threshold (5000 ft): %.0f ft\n', landing_dist);
    constraintInputsFailed=constraintInputsFailed+1;
end

% Beta checks for takeoff and landing (full fuel load)
beta_takeoff = Main(12,19);
if isnan(beta_takeoff) || abs(beta_takeoff - 1) > tolBeta
    logText = logf(logText, 'Takeoff: W/WTO expected 1.000 for 100%% fuel load; found %.3f. Please update to 100%% fuel load weight fraction.\n', beta_takeoff);
    constraintInputsFailed = constraintInputsFailed + 1;
end
beta_landing = Main(13,19);
if isnan(beta_landing) || abs(beta_landing - 1) > tolBeta
    logText = logf(logText, 'Landing: W/WTO expected 1.000 for 100%% fuel load; found %.3f. Please update to 100%% fuel load weight fraction.\n', beta_landing);
    constraintInputsFailed = constraintInputsFailed + 1;
end

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% Integrated Constraint Table Validation ---
% Logic: Check all constraints in the Jet constraint table against
% thresholds, objectives, or exact matches as specified in the RFP
% Attachment 2. For objective/threshold values, the expected exact is a
% NaN that triggers it to be ignored in the exact comparison. For exact
% parameters, it has NaN in the threshold/objective columns so only the
% exact value will be compared. This will then loop through all 7
% specified constraints. 1 point is deducted if there are any errors.

% Define expected values for rows 1–7.
% ** Change this block to change the mission***************************
% Format: [row, Mach_min, Mach_obj, Mach_eq, Alt_eq, n_eq, n_min, n_obj, AB_eq, Ps_eq, Ps_min, Ps_obj, CDx_eq]
expected_constraints = [
    1, 2.0, 2.2, NaN, NaN, 1, NaN, NaN, 100, 0, NaN, NaN, 0;       % Max Mach
    2, 1.5, 1.8, NaN, NaN, 1, NaN, NaN,   0, 0, NaN, NaN, 0;       % Supercruise
    4, NaN, NaN, 1.20, 30000, NaN, 3.0, 4.0, 100, 0, NaN, NaN, 0;  % Combat Turn 1
    5, NaN, NaN, 0.90, 10000, NaN, 4.0, 4.5, 100, 0, NaN, NaN, 0;  % Combat Turn 2
    6, NaN, NaN, 1.15, 30000, 1, NaN, NaN, 100, NaN, 400, 500, 0;  % Ps1
    7, NaN, NaN, 0.90, 10000, 1, NaN, NaN,   0, NaN, 400, 500, 0   % Ps2
    ];

% Define constraint labels for rows 1–10
constraintLabels = {'MaxMach', 'CruiseMach','Cmbt Turn1', 'Cmbt Turn2', 'Ps1', 'Ps2'};

for constraintnum = 1:size(expected_constraints, 1)
    % Collect each requirement from the RFP into a unique variable
    row = expected_constraints(constraintnum, 1) + 2; % Main(3:10,...)
    mach_min = expected_constraints(constraintnum, 2);
    mach_obj = expected_constraints(constraintnum, 3);
    mach_eq  = expected_constraints(constraintnum, 4);
    alt_eq   = expected_constraints(constraintnum, 5);
    n_eq     = expected_constraints(constraintnum, 6);
    n_min    = expected_constraints(constraintnum, 7);
    n_obj    = expected_constraints(constraintnum, 8);
    ab_eq    = expected_constraints(constraintnum, 9);
    ps_eq    = expected_constraints(constraintnum,10);
    ps_min   = expected_constraints(constraintnum,11);
    ps_obj   = expected_constraints(constraintnum,12);
    cdx_eq   = expected_constraints(constraintnum,13);

    % Actual values from the JET sheet
    mach = Main(row, 21);   % T
    alt  = Main(row, 20);   % U
    n    = Main(row, 22);   % V
    ab   = Main(row, 23);   % W
    ps   = Main(row, 24);   % X
    cdx  = Main(row, 25);   % Y

    label = constraintLabels{constraintnum};  % i is the loop index for the constraint

    % Mach equality or threshold
    if ~isnan(mach_eq)
        if abs(mach - mach_eq) > tolMach
            logText = logf(logText, '%s: Mach = %.2f, expected %.2f\n', label, mach, mach_eq);
            constraintInputsFailed = constraintInputsFailed + 1;
        end
    elseif ~isnan(mach_min)
        if mach < mach_min - tolMach
            logText = logf(logText, '%s: Mach = %.2f, must be ≥ %.2f\n', label, mach, mach_min);
            constraintInputsFailed = constraintInputsFailed + 1;
        elseif ~isnan(mach_obj) && mach >= mach_obj - tolMach
            logText = logf(logText, '%s: Mach meets objective (≥ %.2f): %.2f\n', label, mach_obj, mach);
        end
    end

    % Altitude equality
    if ~isnan(alt_eq) && abs(alt - alt_eq) > tolAlt
        logText = logf(logText, '%s: Altitude = %.0f, expected %.0f\n', label, alt, alt_eq);
        constraintInputsFailed = constraintInputsFailed + 1;
    end

    % Load factor
    if ~isnan(n_eq)
        if abs(n - n_eq) > tolN
            logText = logf(logText, '%s: n = %.1f, expected %.1f\n', label, n, n_eq);
            constraintInputsFailed = constraintInputsFailed + 1;
        end
    elseif ~isnan(n_min)
        if n < n_min - tolN
            logText = logf(logText, '%s: g-load = %.1f g, must be ≥ %.1f g\n', label, n, n_min);
            constraintInputsFailed = constraintInputsFailed + 1;
        elseif ~isnan(n_obj) && n >= n_obj - tolN
            logText = logf(logText, '%s: g-load meets objective (≥ %.1f g): %.1f g\n', label, n_obj, n);
        end
    end

    % Afterburner equality
    if ~isnan(ab_eq) && abs(ab - ab_eq) > tolAb
        logText = logf(logText, '%s: AB = %.0f%%, expected %.0f%%\n', label, ab, ab_eq);
        constraintInputsFailed = constraintInputsFailed + 1;
    end

    % Ps equality or threshold
    if ~isnan(ps_eq)
        if abs(ps - ps_eq) > tolPs
            logText = logf(logText, '%s: Ps = %.0f ft/s, expected %.0f ft/s\n', label, ps, ps_eq);
            constraintInputsFailed = constraintInputsFailed + 1;
        end
    elseif ~isnan(ps_min)
        if ps < ps_min - tolPs
            logText = logf(logText, '%s: Ps = %.0f ft/s, must be ≥ %.0f ft/s\n', label, ps, ps_min);
            constraintInputsFailed = constraintInputsFailed + 1;
        elseif ~isnan(ps_obj) && ps >= ps_obj - tolPs
            logText = logf(logText, '%s: Ps meets objective (≥ %.0f ft/s): %.0f ft/s\n', label, ps_obj, ps);
        end
    end

    % Beta (fuel load) check
   betaValue = Main(row, 19);
   if ~isnan(betaDefault)
        if isnan(betaValue) || abs(betaValue - betaDefault) > tolBeta
            logText = logf(logText, '%s: W/WTO expected %.3f for 100%% fuel load; found %.3f. Please update to 100%% fuel load weight fraction.\n', label, betaDefault, betaValue);
            constraintInputsFailed = constraintInputsFailed + 1;
        end
    end

    % CDx equality
    if ~isnan(cdx_eq) && abs(cdx - cdx_eq) > tolCdx
        logText = logf(logText, '%s: CDx = %.3f, expected %.3f\n', label, cdx, cdx_eq);
        constraintInputsFailed = constraintInputsFailed + 1;
    end

end

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%% Constraint above curve check (0 points), if applicable
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% Abort early if Main contains Excel error values
invalidCells = {};
for r = 1:size(Main,1)
    for c = 1:size(Main,2)
        val = Main(r,c);
        if (isstring(val) || ischar(val))
            sval = string(val);
            if ~isempty(sval) && startsWith(sval, "#")
                invalidCells{end+1} = sprintf('%s%d', excelCol(c), r); %#ok<AGROW>
            end
        elseif isnumeric(val)
            if isinf(val)  % treat infinities as errors; allow NaN/blank
                invalidCells{end+1} = sprintf('%s%d', excelCol(c), r); %#ok<AGROW>
            end
        end
    end
end
if ~isempty(invalidCells)
    logText = sprintf('Invalid for analysis: Excel errors in Main sheet at %s. Correct the errors and resubmit.\n', strjoin(invalidCells, ', '));
    pt = 0;
    fb = char(logText);
    return;
end

try
    curveMessages = strings(0);
    % Extract W/S axis (x-values) from row 22, columns K–AE (11:31)
    WS_axis = Consts(22, 11:31);  % L22:AE22 (columns 11-31)
    WS_axis = double(WS_axis);

    % Define constraint rows - exclude 25 (MaxAlt), 30 (Ps3), and 31 (blank)
    constraintRows = [23, 24, 26, 27, 28, 29, 32];  % Skip rows 25, 30, 31
    columnLabels = ["MaxMach", "Supercruise", "CombatTurn1", ...
        "CombatTurn2", "Ps1", "Ps2", "Takeoff"];

    % Read design point from Main sheet
    WS_design = Main(13, 16);     % P13 - Design W/S
    TW_design = Main(13, 17);     % Q13 - Design T/W
    

    ConstraintsFailed = 0;
    WhichFailed = strings(1, length(constraintRows) + 1);  % +1 for landing
    numFailed = 0;

    % Loop through each constraint row (curves)
    for idx = 1:length(constraintRows)
        row = constraintRows(idx);
        TW_curve = Consts(row, 11:31);  % L:AE for this constraint (columns 11-31)
        TW_curve = double(TW_curve);

        % Interpolate required T/W at design W/S (no sorting - preserve order for plotting)
        estimatedTWvalue = interp1(WS_axis, TW_curve, WS_design, 'pchip', 'extrap');

        if TW_design < estimatedTWvalue
            % Design point is below the curve — fail
            ConstraintsFailed = ConstraintsFailed + 1;
            numFailed = numFailed + 1;
            WhichFailed(numFailed) = columnLabels(idx);
            if columnLabels(idx) == "Takeoff"
                curveMessages(end + 1) = sprintf(['Takeoff constraint violated: T/W = %.2f is below the required %.2f. ' ...
                    'Increase allowed takeoff distance (if under threshold) to lower the requirement, or move above the line by raising T/W (more thrust) or moving left with lower wing loading.'], ...
                    TW_design, estimatedTWvalue);
            end
        end
    end

    % Landing constraint: Special case - vertical line at W/S limit
    % Design must be to the LEFT of (less than) this vertical line
WS_limit_landing = Consts(33, 12);  % L33 - Landing W/S limit

if WS_design > WS_limit_landing
    ConstraintsFailed = ConstraintsFailed + 1;
    numFailed = numFailed + 1;
    WhichFailed(numFailed) = "Landing";
    curveMessages(end + 1) = sprintf(['Landing constraint violated: W/S = %.2f exceeds limit of %.2f. Increase the landing length ' ...
        'or reduce W/S to move your design left of the landing constraint'], WS_design, WS_limit_landing);
end

    % Trim WhichFailed array to actual size
    WhichFailed = WhichFailed(1:numFailed);

    % --- Generate Error Message if Constraints Were Violated ---
    if ConstraintsFailed > 0
        pluralSuffix = "";
        if ConstraintsFailed > 1
            pluralSuffix = "s";
        end
        msg = "Design did not meet the following constraint" + pluralSuffix + ": " + strjoin(WhichFailed, ', ');
        if ConstraintsFailed > 6
            msg = msg + ", among other issues. Consider seeking EI.";
        else
            msg = msg + ". Consider lowering your standards if above threshold.";
        end
        curveMessages(end + 1) = msg;
        % pt = pt - 1;  % Uncomment if you want to deduct points
    end

catch ME
    curveMessages(end + 1) = sprintf('Could not perform constraint curve check due to error: %s', ME.message);
    WhichFailed = strings(0); %#ok<NASGU>
end

% Post-curve objective messages (only if the curve didn't fail)
if exist('WhichFailed','var')
    if takeoff_dist <= 2500 + distTol && ~any(strcmp(WhichFailed, "Takeoff"))
        logText = logf(logText, 'Takeoff distance meets objective (≤2500 ft): %.0f ft\n', takeoff_dist);
    end
    if landing_dist <= 3500 + distTol && ~any(strcmp(WhichFailed, "Landing"))
        logText = logf(logText, 'Landing distance meets objective (≤3500 ft): %.0f ft\n', landing_dist);
    end
end

% Append curve messages after distance/objective notes
if exist('curveMessages','var') && ~isempty(curveMessages)
    for i = 1:numel(curveMessages)
        logText = logf(logText, '%s\n', curveMessages(i));
    end
end

% Constraint summary and point impact after all checks
addConstraintSummary = constraintInputsFailed > 0;
if addConstraintSummary
    logText = logf(logText, '-1 Point One or more constraints mentioned above are incorrect\n');
    pt = pt - 1;
end

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%% ---  Geometry, Attachment, and Stealth Check (1 point) %%%%%%%%%%%
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
geometryFailures = 0;
VALUE_TOL = 1e-3;
AR_TOL = 0.1;
VT_WING_FRACTION = 0.8;
STEALTH_TOL = 5;

fuselage_length = Main(32, 2); % B32
fuselage_end = fuselage_length;
PCS_area = Main(18, 3);        % Pitch control surface area (C18)
PCS_x = Main(23, 3);           % C23
PCS_root_chord = Geom(8, 3);   % C8

if PCS_area >= 1
    if any(isnan([fuselage_end, PCS_x, PCS_root_chord]))
        logText = logf(logText, 'Unable to verify PCS placement due to missing geometry data\n');
        geometryFailures = geometryFailures + 1;
    elseif PCS_x > (fuselage_end - 0.25 * PCS_root_chord)
        logText = logf(logText, 'PCS X-location too far aft. Must overlap at least 25%% of root chord.\n');
        geometryFailures = geometryFailures + 1;
    end
end

VT_area = Main(18, 8);         % Vertical tail area (H18)
VT_x = Main(23, 8);            % H23
VT_root_chord = Geom(10, 3);   % C10

if VT_area >= 1
    if any(isnan([fuselage_end, VT_x, VT_root_chord]))
        logText = logf(logText, 'Unable to verify vertical tail placement due to missing geometry data\n');
        geometryFailures = geometryFailures + 1;
    elseif VT_x > (fuselage_end - 0.25 * VT_root_chord)
        logText = logf(logText, 'VT X-location too far aft. Must overlap at least 25%% of root chord.\n');
        geometryFailures = geometryFailures + 1;
    end
end

PCS_z = Main(25, 3);          % C25
fuse_z_center = Main(52, 4);  % D52
fuse_z_height = Main(52, 6);  % F52

if PCS_area >= 1
    if any(isnan([PCS_z, fuse_z_center, fuse_z_height]))
        logText = logf(logText, 'Unable to verify PCS vertical placement due to missing geometry data\n');
        geometryFailures = geometryFailures + 1;
    elseif PCS_z < (fuse_z_center - fuse_z_height/2) || PCS_z > (fuse_z_center + fuse_z_height/2)
        logText = logf(logText, 'PCS Z-location outside fuselage vertical bounds.\n');
        geometryFailures = geometryFailures + 1;
    end
end

VT_y = Main(24, 8);           % H24
fuse_width = Main(52, 5);     % E52
vtMountedOffFuselage = false;

if VT_area >= 1
    if any(isnan([VT_y, fuse_width]))
        logText = logf(logText, 'Unable to verify vertical tail lateral placement due to missing geometry data\n');
        geometryFailures = geometryFailures + 1;
    elseif abs(VT_y) > fuse_width/2 + VALUE_TOL
        vtMountedOffFuselage = true;
        logText = logf(logText, 'Vertical tail mounted off the fuselage; ensure structural support at the wing.\n');
    end
end

% Strakes
if Main(18, 4) >= 1  % D18 >= 1 indicating area in the strakes
    sweep = Geom(15, 11);   % K15
    y = Geom(152, 13);      % M152
    strake = Geom(155, 12); % L155
    apex = Geom(38, 12);    % L38
    if any(isnan([sweep, y, strake, apex]))
        logText = logf(logText, 'Unable to verify strake attachment due to missing geometry data\n');
        geometryFailures = geometryFailures + 1;
    else
        wingAttach = (y / tand(90 - sweep) + apex);
        if wingAttach >= (strake + 0.5)
            logText = logf(logText, 'Strake disconnected.\n');
            geometryFailures = geometryFailures + 1;
        end
    end
end

component_positions = Main(23, 2:8);  % B23:H23
component_areas = Main(18, 2:8);      % B18:H18
active_components = component_positions(component_areas >= 1);
if ~isempty(active_components)
    if any(isnan(fuselage_end))
        logText = logf(logText, 'Unable to verify component X-location due to missing fuselage length\n');
        geometryFailures = geometryFailures + 1;
    elseif any(active_components >= fuselage_end)
        logText = logf(logText, 'One or more components X-location extend beyond the fuselage end (B32 = %.2f)\n', fuselage_end);
        geometryFailures = geometryFailures + 1;
    end
end

% VT mounted to wing overlap if off-fuselage
if vtMountedOffFuselage
    vtApex = geomPlanformPoint(Geom, 163);
    vtRootTE = geomPlanformPoint(Geom, 166);
    wingTE = geomPlanformPoint(Geom, 41);
    if any(isnan([vtApex(1), vtRootTE(1), wingTE(1)]))
        logText = logf(logText, 'Unable to verify vertical tail overlap with wing due to missing geometry data\n');
        geometryFailures = geometryFailures + 1;
    else
        chord = vtRootTE(1) - vtApex(1);
        overlap = max(0, min(wingTE(1), vtRootTE(1)) - vtApex(1));
        if ~(chord > 0) || overlap + VALUE_TOL < VT_WING_FRACTION * chord
            logText = logf(logText, 'Vertical tail mounted on the wing must overlap at least 80%% of its root chord with the wing trailing edge.\n');
            geometryFailures = geometryFailures + 1;
        end
    end
end

wingAR = Main(19, 2);
pcsAR = Main(19, 3);
vtAR = Main(19, 8);
if ~isnan(wingAR) && ~isnan(pcsAR) && pcsAR > wingAR + AR_TOL
    logText = logf(logText, 'Pitch control surface aspect ratio (%.2f) must be lower than wing aspect ratio (%.2f).\n', pcsAR, wingAR);
    geometryFailures = geometryFailures + 1;
end
if ~isnan(wingAR) && ~isnan(vtAR) && vtAR >= wingAR - AR_TOL
    logText = logf(logText, 'Vertical tail aspect ratio (%.2f) must be lower than wing aspect ratio (%.2f).\n', vtAR, wingAR);
    geometryFailures = geometryFailures + 1;
end

% Engine and overhang checks
engine_diameter = Main(29, 8);
engine_length = Main(29, 9);
inlet_x = Main(31, 6);
compressor_x = Main(32, 6);
engine_start = inlet_x + compressor_x;
widthValues = [];
if ~isnan(engine_start)
    for row = 34:53
        station_x = Main(row, 2);
        width = Main(row, 5);
        if ~isnan(station_x) && ~isnan(width) && station_x >= engine_start
            widthValues(end+1) = width; %#ok<AGROW>
        end
    end
end
if isempty(widthValues) || isnan(engine_diameter)
    logText = logf(logText, 'Unable to verify fuselage width clearance for engines\n');
    geometryFailures = geometryFailures + 1;
else
    minWidth = min(widthValues);
    maxWidth = max(widthValues);
    requiredWidth = engine_diameter + 0.5;
    if minWidth + VALUE_TOL <= requiredWidth
        logText = logf(logText, 'Fuselage minimum width (%.2f ft) must exceed engine diameter + 0.5 ft (%.2f ft).\n', minWidth, requiredWidth);
    end
    allowedOverhang = 2.5 * maxWidth;
    if ~isnan(fuselage_end)
        pcsTipX = max(Geom(117, 12), Geom(118, 12));
        vtTipX = max(Geom(165, 12), Geom(166, 12));
        if ~isnan(pcsTipX)
            overhang = pcsTipX - fuselage_end;
            if overhang > allowedOverhang + VALUE_TOL
                logText = logf(logText, ['Pitch control surface extends %.2f ft beyond the fuselage end ' ...
                    '(limit %.2f ft based on fuselage width).\n'], overhang, allowedOverhang);
            end
        end
        if ~isnan(vtTipX)
            overhang = vtTipX - fuselage_end;
            if overhang > allowedOverhang + VALUE_TOL
                logText = logf(logText, ['Vertical tail extends %.2f ft beyond the fuselage end ' ...
                    '(limit %.2f ft based on fuselage width).\n'], overhang, allowedOverhang);
            end
        end
    end
end

if any(isnan([engine_diameter, fuselage_end, inlet_x, compressor_x, engine_length]))
    logText = logf(logText, 'Unable to verify engine protrusion due to missing geometry data\n');
    geometryFailures = geometryFailures + 1;
else
    protrusion = inlet_x + compressor_x + engine_length - fuselage_end;
    if protrusion > engine_diameter + VALUE_TOL
        logText = logf(logText, 'Engine nacelles protrude %.2f ft past the fuselage end (limit %.2f ft).\n', protrusion, engine_diameter);
        geometryFailures = geometryFailures + 1;
    end
end

%% Stealth shaping (shares geometry bucket)
stealthFailures = 0;
stealthHeaderShown = false;

wingLeadingAngle = computeEdgeAngleDeg(Geom, 38, 39);
wingTrailingAngle = computeEdgeAngleDeg(Geom, 40, 41);
pcsLeadingAngle = computeEdgeAngleDeg(Geom, 115, 116);
pcsTrailingAngle = computeEdgeAngleDeg(Geom, 117, 118);
strakeLeadingAngle = computeEdgeAngleDeg(Geom, 152, 153);
strakeTrailingAngle = computeEdgeAngleDeg(Geom, 154, 155);
vtLeadingAngle = computeEdgeAngleDeg(Geom, 163, 164);
vtTrailingAngle = computeEdgeAngleDeg(Geom, 165, 166);
pcsDihedral = Main(26, 3);
vtTilt = Main(27, 8);
wingArea = Main(18, 2);
pcsArea = Main(18, 3);
strakeArea = Main(18, 4);
vtArea = Main(18, 8);
wingActive = ~isnan(wingArea) && wingArea >= 1;
pcsActive = ~isnan(pcsArea) && pcsArea >= 1;
strakeActive = ~isnan(strakeArea) && strakeArea >= 1;
vtActive = ~isnan(vtArea) && vtArea >= 1;

if pcsActive && wingActive && ~anglesParallel(pcsLeadingAngle, wingLeadingAngle, STEALTH_TOL)
    if ~stealthHeaderShown
        logText = logf(logText, 'Stealth shaping violations:\n');
        stealthHeaderShown = true;
    end
    logText = logf(logText, 'Pitch control surface leading edge sweep %.1f° must match the wing leading edge sweep %.1f° (+/- %.1f°).\n', pcsLeadingAngle, wingLeadingAngle, STEALTH_TOL);
    stealthFailures = stealthFailures + 1;
end

wingTipTE = geomPlanformPoint(Geom, 40);
wingCenterTE = geomPlanformPoint(Geom, 41);
if ~(wingActive && (anglesParallel(wingTrailingAngle, wingLeadingAngle, STEALTH_TOL) || teNormalHitsCenterline(wingTipTE, wingCenterTE)))
    if ~stealthHeaderShown
        logText = logf(logText, 'Stealth shaping violations:\n');
        stealthHeaderShown = true;
    end
    logText = logf(logText, 'Wing trailing edge %.1f° is not parallel to the leading edge and its normal does not reach the fuselage centerline (+/- %.1f°).\n', wingTrailingAngle, STEALTH_TOL);
    stealthFailures = stealthFailures + 1;
end

if pcsActive && ~isnan(pcsDihedral) && pcsDihedral > 5
    [logText, stealthFailures, stealthHeaderShown] = requireParallelAngle(logText, stealthFailures, stealthHeaderShown, pcsLeadingAngle, wingLeadingAngle, STEALTH_TOL, 'Pitch control surface leading edge sweep %.1f° must be parallel to the wing leading edge %.1f° (+/- %.1f°).\n');
    [logText, stealthFailures, stealthHeaderShown] = requireParallelAngle(logText, stealthFailures, stealthHeaderShown, pcsTrailingAngle, wingLeadingAngle, STEALTH_TOL, 'Pitch control surface trailing edge sweep %.1f° must be parallel to the wing leading edge %.1f° (+/- %.1f°).\n');
end

if strakeActive
    [logText, stealthFailures, stealthHeaderShown] = requireParallelAngle(logText, stealthFailures, stealthHeaderShown, strakeLeadingAngle, wingLeadingAngle, STEALTH_TOL, 'Strake leading edge sweep %.1f° must be parallel to the wing leading edge %.1f° (+/- %.1f°).\n');
    [logText, stealthFailures, stealthHeaderShown] = requireParallelAngle(logText, stealthFailures, stealthHeaderShown, strakeTrailingAngle, wingLeadingAngle, STEALTH_TOL, 'Strake trailing edge sweep %.1f° must be parallel to the wing leading edge %.1f° (+/- %.1f°).\n');
end

if ~vtActive
    % ignore
elseif isnan(vtTilt)
    if ~stealthHeaderShown
        logText = logf(logText, 'Stealth shaping violations:\n');
        stealthHeaderShown = true;
    end
    logText = logf(logText, 'Unable to verify stealth shaping due to missing geometry data\n');
    stealthFailures = stealthFailures + 1;
elseif vtTilt < 85
    [logText, stealthFailures, stealthHeaderShown] = requireParallelAngle(logText, stealthFailures, stealthHeaderShown, vtLeadingAngle, wingLeadingAngle, STEALTH_TOL, 'Vertical tail leading edge sweep %.1f° must be parallel to the wing leading edge %.1f° (+/- %.1f°).\n');
    [logText, stealthFailures, stealthHeaderShown] = requireParallelAngle(logText, stealthFailures, stealthHeaderShown, vtTrailingAngle, wingLeadingAngle, STEALTH_TOL, 'Vertical tail trailing edge sweep %.1f° must be parallel to the wing leading edge %.1f° (+/- %.1f°).\n');
end

% Fold stealth failures into geometry (max 1 point total)
if stealthFailures > 0
    geometryFailures = geometryFailures + 1;
end
if geometryFailures > 0
    logText = logf(logText, '-1 Point Geometry/attachment/stealth issues detected; see notes above.\n');
    pt=pt-1;
end

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%% --- Stability Checks (1 point) %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% Ensure adequate static margin and acceptable lat/dir stability
% derivatives

SM = Main(10, 13);   % M10
clb = Main(10, 15);  % O10
cnb = Main(10, 16);  % P10
rat = Main(10, 17);  % Q10

stabilityPass = 1;
if ~(SM >= -0.1 && SM <= 0.11)
    logText = logf(logText, 'Static Margin out of bounds\n');
    stabilityPass = 0;
elseif SM < 0
    logText = logf(logText, 'Warning: Unstable aircraft - Recommend to increase SM above 0 or your glider will not fly \n');
end
if clb >= -0.001
    logText = logf(logText, 'Clb out of bounds\n');
    stabilityPass = 0;
end
if cnb <= 0.002
    logText = logf(logText, 'Cnb out of bounds\n');
    stabilityPass = 0;
end
if ~(rat >= -1 && rat <= -0.3)
    logText = logf(logText, 'Cnb/Clb ratio out of bounds\n');
    stabilityPass = 0;
end

if stabilityPass == 0
    logText = logf(logText, '-1 Point Unstable! Adjust your aircraft to achieve flyable stability parameters by fixing red cells in Main M10-Q10.\n');
    pt=pt-1;
end

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%% Fuel and Volume Check (2 points)
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% Ensure more fuel available than required

fuelAvailable = Main(18, 15);  % O18
fuelRequired = Main(40, 24);   % X40

if fuelAvailable < fuelRequired
    logText = logf(logText, '-1 Point Insufficient fuel: Available = %.1f lb, Required = %.1f lb\n', fuelAvailable, fuelRequired);
    pt = pt - 1;
end

volumeRemaining = Main(23, 17); % Q23
if volumeRemaining > 0
    %     logText = logf(logText, 'Volume check passed: %.2f remaining\n', volumeRemaining);
else
    logText = logf(logText, '-1 Point Insufficient volume remaining: %.2f ft^3 additional required\n', volumeRemaining);
    pt = pt - 1;
end
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%% Recurring Cost (Q31) (1 pt)%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

cost = Main(31, 17); % Q31
numAircraft = Main(31,14); % N31
costDeduction = 0;

if numAircraft == 187
    if cost > 115
        logText = logf(logText, '-1 Point Recurring cost exceeds threshold for 187-aircraft case ($115M): $%.1fM\n', cost);
        costDeduction = costDeduction + 1;
    elseif cost <= 100
        logText = logf(logText, 'Recurring cost meets objective for 187-aircraft case (≤$100M): $%.1fM\n', cost);
    end
elseif numAircraft == 800
    if cost > 75
        logText = logf(logText, '-1 Point Recurring cost exceeds threshold for 800-aircraft case ($75M): $%.1fM\n', cost);
        costDeduction = costDeduction + 1;
    elseif cost <= 63
        logText = logf(logText, 'Recurring cost meets objective for 800-aircraft case (≤$61M): $%.1fM\n', cost);
    end
else
    logText = logf(logText, '-1 Point %.0f is not a valid number of aircraft (must be 187 or 800) for cost estimation\n', numAircraft);
    costDeduction = costDeduction + 1;
end

if costDeduction > 0
    pt = pt - 1;
end


%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%% Landing Gear Checks (1 pt)
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

LandingGearGood = 1;
gearTolPercent = 0.5;
gearTolAngle = 0.1;
gearTolSpeed = 0.5;

gearNoseWeight = Gear(20, 10);
if isnan(gearNoseWeight) || gearNoseWeight < 80 - gearTolPercent || gearNoseWeight > 90.5 + gearTolPercent
    logText = logf(logText, 'Violates main gear 90/10 rule share at J20: %.1f%% (must be between 80.0%% and 90.5%%)\n', gearNoseWeight);
    LandingGearGood = 0;
end

tipbackActual = Gear(20, 12);
tipbackLimit = Gear(21, 12);
if isnan(tipbackActual) || isnan(tipbackLimit) || tipbackActual >= tipbackLimit - gearTolAngle
    logText = logf(logText, 'Violates tipback angle requirement: upper %.2f%s must be less than lower %.2f%s\n', tipbackActual, char(176), tipbackLimit, char(176));
    LandingGearGood = 0;
end

rolloverActual = Gear(20, 13);
rolloverLimit = Gear(21, 13);
if isnan(rolloverActual) || isnan(rolloverLimit) || rolloverActual >= rolloverLimit - gearTolAngle
    logText = logf(logText, 'Violates rollover angle requirement: upper %.2f%s must be less than lower %.2f%s\n', rolloverActual, char(176), rolloverLimit, char(176));
    LandingGearGood = 0;
end

rotationAuthority = Gear(20, 14);
takeoffSpeed = Gear(21, 14);
if isnan(rotationAuthority) || isnan(takeoffSpeed) || rotationAuthority >= takeoffSpeed - gearTolSpeed
    logText = logf(logText, 'Violates takeoff rotation speed: %.1f kts (must be < %.1f kts)\n', rotationAuthority, takeoffSpeed);
    LandingGearGood = 0;
end
% Deduct if takeoff speed exceeds 200 kts
if isnan(takeoffSpeed) || takeoffSpeed >= 200 + gearTolSpeed
    logText = logf(logText, 'Violates takeoff speed limit: %.1f kts (must be ≤ 200 kts)\n', takeoffSpeed);
    LandingGearGood = 0;
end

if LandingGearGood ~= 1
    pt = pt - 1;
    logText = logf(logText, '-1 point Landing gear geometry outside limits; see notes above and the "Gear" tab.\n');
end
%     fprintf('Geometry Check Complete\n')

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%% Output total points(cadetnum) and store log text
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
logText = logf(logText,'Jet11 Score is %d out of 10\n',pt);
logText = logf(logText,'Cutout is 5 out of 5\n\n');
[~, name, ext] = fileparts(filename);
fprintf('%s completed\n', [name, ext]);
fprintf('Jet11 Score is %d out of 10\n',pt)
fprintf('Cutout is 5 out of 5\n\n')
logText = strjoin(logText, ''); % Join logText into a single string, using newline as delimiter.
fb = char(logText); % Accumulate log text
end

%% Function to read all useful sheets, and verify numbers returned for used cells
function sheets = loadAllJet11Sheets(filename)
%LOADALLJet11SHEETS Load all required Jet11 sheets using safeReadMatrix
%   sheets = loadAllJet11Sheets(filename) returns a struct with fields:
%   Aero, Miss, Main, Consts, Gear, Geom

sheets.Aero   = safeReadMatrix(filename, 'Aero',   {'G3','G4','G10','G11','A15','A16'});
sheets.Miss   = safeReadMatrix(filename, 'Miss',   {'C48','C49'});
sheets.Main   = safeReadMatrix(filename, 'Main',   {'T3','U3','V3','W3','X3','Y3','T4','U4','V4','W4','X4','Y4','T6','U6',...
    'V6','W6','X6','Y6','T7','U7','V7','W7','X7','Y7','T8','U8','V8','W8',...
    'X8','Y8','T9','U9','V9','W9','X9','Y9','AB3','AB4','X12','X13','M10',...
    'O10','P10','Q10','O18','X40','Q23','Q31','N31','B32','C23','H23','C26',...
    'H27','H29','I29','F31','F32','B34','E34','B53','E53','D18','D23','D52','F52','H24','E52'});
sheets.Consts = safeReadMatrix(filename, 'Consts', {'K22','K23','K24','K26','K27','K28','K29','K32','AO42','AQ41','K33'});
sheets.Gear   = safeReadMatrix(filename, 'Gear',   {'J20','L20','L21','M20','M21','N20','N21'});
sheets.Geom   = safeReadMatrix(filename, 'Geom',   {'C8','C10','L38','L40','L41','L115','L116','L117','L118','L152','M152','L153','L154','L155','L163','L164','L165','L166'});

% Constants is off by three rows. Row 22 of the Consts tab comes in as
% row 19 in matlab Consts variable. Adding three rows of NaN to the top
% so it can be addressed accurately.

% sheets.Consts = [NaN(3, size(sheets.Consts, 2)); sheets.Consts];

end

%% Function to read the data from the excel sheets as quickly and accurately as possible
function data = safeReadMatrix(filename, sheetname, fallbackCells)
% safeReadMatrix - Efficiently reads numeric data from an Excel sheet.
%   Attempts fast readmatrix first. If key cells are NaN, falls back to readcell.
%
% Inputs:
%   filename      - Excel file path
%   sheetname     - Sheet name to read
%   fallbackCells - Cell array of cell references to verify (e.g., {'G4', 'G10'})
%
% Output:
%   data - Numeric matrix with fallback values patched in if needed

% Try fast read
data = readmatrix(filename, 'Sheet', sheetname,'DataRange','A1:AQ250');


% Convert cell references to row/col indices
fallbackIndices = cellfun(@(c) cell2sub(c), fallbackCells, 'UniformOutput', false);

% Check for NaNs in fallback cells
needsPatch = false;
for i = 1:numel(fallbackIndices)
    idx = fallbackIndices{i};
    if idx(1) > size(data,1) || idx(2) > size(data,2) || isnan(data(idx(1), idx(2)))
        needsPatch = true;
        fprintf('Patched %s cell %s with value %.4f\n', sheetname, sub2excel(idx(1), idx(2)), data(idx(1), idx(2)));
        break;
    end
end

% If needed, patch from readcell
if needsPatch
    raw = readcell(filename, 'Sheet', sheetname);
    for i = 1:numel(fallbackIndices)
        idx = fallbackIndices{i};
        if idx(1) <= size(raw,1) && idx(2) <= size(raw,2)
            val = raw{idx(1), idx(2)};
            if isnumeric(val)
                data(idx(1), idx(2)) = val;
            elseif ischar(val) || isstring(val)
                data(idx(1), idx(2)) = str2double(val);
            end
        end
    end
end
end

function idx = cell2sub(cellref)
% Converts Excel cell reference (e.g., 'G4') to row/col indices
col = regexp(cellref, '[A-Z]+', 'match', 'once');
row = str2double(regexp(cellref, '\d+', 'match', 'once'));
colNum = 0;
for i = 1:length(col)
    colNum = colNum * 26 + (double(col(i)) - double('A') + 1);
end
idx = [row, colNum];
end

function ref = sub2excel(row, col)
letters = '';
while col > 0
    rem = mod(col - 1, 26);
    letters = [char(65 + rem), letters]; %#ok<AGROW>
    col = floor((col - 1) / 26);
end
ref = sprintf('%s%d', letters, row);
end

function angle = computeEdgeAngleDeg(Geom, rowA, rowB)
p1 = geomPlanformPoint(Geom, rowA);
p2 = geomPlanformPoint(Geom, rowB);
if any(isnan([p1, p2]))
    angle = NaN;
    return;
end
dx = abs(p2(1) - p1(1));
dy = abs(p2(2) - p1(2));
if dx == 0 && dy == 0
    angle = 0;
else
    angle = atan2d(dy, dx);
end
end

function point = geomPlanformPoint(Geom, row)
x = Geom(row, 12);
yCandidates = [Geom(row, 13), Geom(row, 14)];
yCandidates = yCandidates(~isnan(yCandidates));
if isempty(yCandidates)
    y = 0;
else
    y = max(abs(yCandidates));
end
point = [x, y];
end

function hit = teNormalHitsCenterline(tipPoint, innerPoint)
if any(isnan([tipPoint, innerPoint]))
    hit = false;
    return;
end
dir = innerPoint - tipPoint;
normals = [dir(2), -dir(1); -dir(2), dir(1)];
hit = false;
for k = 1:2
    normal = normals(k, :);
    if abs(normal(2)) < 1e-6
        continue;
    end
    t = -tipPoint(2) / normal(2);
    if t <= 0
        continue;
    end
    hit = true;
    break;
end
end

function tf = anglesParallel(angle, wingAngle, tol)
if isnan(angle) || isnan(wingAngle)
    tf = false;
    return;
end
a = mod(angle, 180);
b = mod(wingAngle, 180);
diffVal = abs(a - b);
alt = 180 - diffVal;
tf = min(diffVal, alt) <= tol;
end

function [logText, failures, headerShown] = requireParallelAngle(logText, failures, headerShown, angle, wingAngle, tol, template)
if isnan(angle) || isnan(wingAngle)
    if ~headerShown
        logText = logf(logText, 'Stealth shaping violations:\n');
        headerShown = true;
    end
    logText = logf(logText, 'Unable to verify stealth shaping due to missing geometry data\n');
    failures = failures + 1;
elseif ~anglesParallel(angle, wingAngle, tol)
    if ~headerShown
        logText = logf(logText, 'Stealth shaping violations:\n');
        headerShown = true;
    end
    logText = logf(logText, template, angle, wingAngle, tol);
    failures = failures + 1;
end
end

%% Function to do an fprintf like function to a local variable for future use
function logText = logf(logText, varargin)
logEntry = sprintf(varargin{:});  % Format input like fprintf
logText = [logText, logEntry];      % Append to string
end


function [mode, selectedPath] = selectRunMode()
% SELECTRUNMODE - Launches a GUI to choose between single file or folder mode



cursorPos = get(0, 'PointerLocation');
dialogWidth = 300;
dialogHeight = 150;

% Position just below the cursor
dialogLeft = cursorPos(1) - dialogWidth / 2;
dialogBottom = cursorPos(2) - dialogHeight - 20;  % 20 pixels below the cursor

d = dialog('Position', [dialogLeft, dialogBottom, dialogWidth, dialogHeight], ...
    'Name', 'Select Run Mode');


txt = uicontrol('Parent',d,...
    'Style','text',...
    'Position',[20 90 260 40],...
    'String','Choose how you want to run the autograder:',...
    'FontSize',10); %#ok<NASGU>

btn1 = uicontrol('Parent',d,...
    'Position',[30 40 100 30],...
    'String','Single File',...
    'Callback',@singleFile); %#ok<NASGU>

btn2 = uicontrol('Parent',d,...
    'Position',[170 40 100 30],...
    'String','Folder of Files',...
    'Callback',@folderRun); %#ok<NASGU>

mode = '';
selectedPath = '';

uiwait(d);  % Wait for user to close dialog

    function singleFile(~,~)
        [file, path] = uigetfile('*.xls*','Select a Jet11 Excel file');
        if isequal(file,0)
            mode = 'cancelled';
        else
            mode = 'single';
            selectedPath = fullfile(path, file);
        end
        delete(d);
    end

    function folderRun(~,~)
        path = uigetdir(pwd, 'Select folder containing Jet11 files');
        if isequal(path,0)
            mode = 'cancelled';
        else
            mode = 'folder';
            selectedPath = path;
        end
        delete(d);
    end
end

%% Prompt user and generate Blackboard CSV (combined function)
function promptAndGenerateBlackboardCSV(folderAnalyzed, files, points, feedback, timestamp)
% Position dialog below cursor
cursorPos = get(0, 'PointerLocation');
dialogWidth = 300;
dialogHeight = 150;
dialogLeft = cursorPos(1) - dialogWidth / 2;
dialogBottom = cursorPos(2) - dialogHeight - 20;

% Create dialog
d = dialog('Position', [dialogLeft, dialogBottom, dialogWidth, dialogHeight], ...
    'Name', 'Blackboard Export');

uicontrol('Parent', d, ...
    'Style', 'text', ...
    'Position', [20 90 260 40], ...
    'String', 'Generate Blackboard CSV for grade import?', ...
    'FontSize', 10);

uicontrol('Parent', d, ...
    'Position', [30 40 100 30], ...
    'String', 'Yes', ...
    'Callback', @(~,~) doExport(true, d));

uicontrol('Parent', d, ...
    'Position', [170 40 100 30], ...
    'String', 'No', ...
    'Callback', @(~,~) doExport(false, d));

    function doExport(shouldExport, dialogHandle)
        delete(dialogHandle);
        if shouldExport
            %% Create Blackboard Offline Grade CSV (SMART_TEXT format)
            csvFilename = fullfile(folderAnalyzed, ['GE2_Blackboard_Offline_', timestamp, '.csv']);
            fid = fopen(csvFilename, 'w');

            % Assignment title column (update if needed)
            assignmentTitle = 'GE 2: AATF Design Iteration 1 & Cutout [Total Pts: 15 Score] |409578';

            % Write header (username only for identification)
            fprintf(fid, '"Username","%s","Grading Notes","Notes Format","Feedback to Learner","Feedback Format"\n', assignmentTitle);

            for i = 1:numel(files)
                fname = files(i).name;

                % Extract username from filename (captures everything between cohort code and \"_attempt\")
                tokens = regexp(fname, '_(c\\d{2}[A-Za-z0-9._-]+)_attempt', 'tokens');
                if ~isempty(tokens)
                    username = tokens{1}{1};
                else
                    username = 'UNKNOWN';
                end
                % Get score and feedback
                score = points(i) + 5;
                fbText = feedback{i};

                % Sanitize feedback for SMART_TEXT (HTML-safe but readable)
                fbText = strrep(fbText, '≥', '&ge;');
                fbText = strrep(fbText, '≤', '&le;');
                fbText = strrep(fbText, '≠', '&ne;');
                fbText = strrep(fbText, '✔', '&#10004;');
                fbText = strrep(fbText, '✘', '&#10008;');
                fbText = strrep(fbText, '✅', '&#9989;');
                fbText = strrep(fbText, '❌', '&#10060;');
                fbText = strrep(fbText, '<', '&lt;');
                fbText = strrep(fbText, '>', '&gt;');
                fbText = strrep(fbText, '"', '&quot;');
                fbText = strrep(fbText, newline, '<br>');

                % Write row
                fprintf(fid, '"%s","%.2f","","","%s","SMART_TEXT"\n', ...
                    username, score, fbText);
            end

            fclose(fid);
            fprintf('Blackboard offline grade CSV created: %s\n', csvFilename);

        end
    end
end


function col = excelCol(idx)
letters = '';
n = idx;
while n > 0
    rem = mod(n-1, 26);
    letters = [char(65 + rem), letters]; %#ok<AGROW>
    n = floor((n-1) / 26);
end
col = letters;
end
