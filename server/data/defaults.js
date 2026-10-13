/* Starter data: the programs and Philippine holidays that used to be hard-coded in the
   browser (requests.js). They now live in MySQL; this file only seeds an empty database
   (npm run db:seed) and powers the "Reset to default list" buttons on the staff pages. */
module.exports = {
  "programs": [
    {
      "name": "Bachelor of Science in Architecture",
      "level": "Undergraduate",
      "majors": []
    },
    {
      "name": "Bachelor of Science in Civil Engineering",
      "level": "Undergraduate",
      "majors": [
        "Construction Engineering & Management",
        "Structural Engineering"
      ]
    },
    {
      "name": "Bachelor of Science in Electrical Engineering",
      "level": "Undergraduate",
      "majors": []
    },
    {
      "name": "Bachelor of Science in Electronics Engineering",
      "level": "Undergraduate",
      "majors": []
    },
    {
      "name": "Bachelor of Science in Mechanical Engineering",
      "level": "Undergraduate",
      "majors": []
    },
    {
      "name": "Bachelor of Science in Industrial Engineering",
      "level": "Undergraduate",
      "majors": []
    },
    {
      "name": "Bachelor of Science in Nursing",
      "level": "Undergraduate",
      "majors": []
    },
    {
      "name": "Bachelor of Science in Hospitality Management",
      "level": "Undergraduate",
      "majors": []
    },
    {
      "name": "Bachelor of Science in Tourism Management",
      "level": "Undergraduate",
      "majors": []
    },
    {
      "name": "Bachelor of Arts in Communication",
      "level": "Undergraduate",
      "majors": [
        "New Media",
        "Creative Performing Arts"
      ]
    },
    {
      "name": "Bachelor of Science in Midwifery",
      "level": "Undergraduate",
      "majors": []
    },
    {
      "name": "Bachelor of Technical-Vocational Teacher Education",
      "level": "Undergraduate",
      "majors": [
        "Animation",
        "Automotive Technology",
        "Drafting Technology",
        "Electronics Technology",
        "Electrical Technology",
        "Mechanical Technology",
        "Civil and Construction Technology",
        "Welding and Fabrication Technology",
        "Heating, Ventilation and Airconditioning",
        "Food and Service Management",
        "Garments, Fashion and Design",
        "Hotel and Restaurant Services"
      ]
    },
    {
      "name": "Bachelor of Science in Computer Science",
      "level": "Undergraduate",
      "majors": [
        "Network & Data Communication",
        "Software Development"
      ]
    },
    {
      "name": "Bachelor of Science in Information Technology",
      "level": "Undergraduate",
      "majors": [
        "Network & Web Application"
      ]
    },
    {
      "name": "Bachelor of Science in Entertainment & Multimedia Computing",
      "level": "Undergraduate",
      "majors": [
        "Game Development",
        "Digital Animation Technology"
      ]
    },
    {
      "name": "Bachelor of Industrial Technology",
      "level": "Undergraduate",
      "majors": [
        "Automotive Technology",
        "Drafting Technology",
        "Electronics Technology",
        "Electrical Technology",
        "Mechanical Technology",
        "Welding and Fabrication Technology",
        "Heating, Ventilating and Air-conditioning",
        "Food and Service Technology",
        "Garments, Fashion and Design"
      ]
    },
    {
      "name": "Doctor of Education",
      "level": "Post-graduate",
      "majors": [
        "Educational Management"
      ]
    },
    {
      "name": "Master of Arts in Education",
      "level": "Graduate",
      "majors": [
        "Educational Management",
        "General Science",
        "Guidance and Counseling",
        "Filipino",
        "Language Education",
        "Mathematics",
        "Social Studies",
        "Technology and Home Economics"
      ]
    },
    {
      "name": "Master in Business Administration",
      "level": "Graduate",
      "majors": []
    },
    {
      "name": "Master in Public Administration",
      "level": "Graduate",
      "majors": []
    },
    {
      "name": "Master in Engineering Management",
      "level": "Graduate",
      "majors": []
    },
    {
      "name": "Master of Arts in Nursing",
      "level": "Graduate",
      "majors": []
    },
    {
      "name": "Master in Physical Education and Sports",
      "level": "Graduate",
      "majors": []
    }
  ],
  "holidays": [
    {
      "date": "2026-01-01",
      "name": "New Year's Day",
      "type": "Regular holiday",
      "yearly": true
    },
    {
      "date": "2026-04-09",
      "name": "Araw ng Kagitingan",
      "type": "Regular holiday",
      "yearly": true
    },
    {
      "date": "2026-05-01",
      "name": "Labor Day",
      "type": "Regular holiday",
      "yearly": true
    },
    {
      "date": "2026-06-12",
      "name": "Independence Day",
      "type": "Regular holiday",
      "yearly": true
    },
    {
      "date": "2026-11-30",
      "name": "Bonifacio Day",
      "type": "Regular holiday",
      "yearly": true
    },
    {
      "date": "2026-12-25",
      "name": "Christmas Day",
      "type": "Regular holiday",
      "yearly": true
    },
    {
      "date": "2026-12-30",
      "name": "Rizal Day",
      "type": "Regular holiday",
      "yearly": true
    },
    {
      "date": "2026-08-21",
      "name": "Ninoy Aquino Day",
      "type": "Special non-working day",
      "yearly": true
    },
    {
      "date": "2026-11-01",
      "name": "All Saints' Day",
      "type": "Special non-working day",
      "yearly": true
    },
    {
      "date": "2026-11-02",
      "name": "All Souls' Day",
      "type": "Special non-working day",
      "yearly": true
    },
    {
      "date": "2026-12-08",
      "name": "Feast of the Immaculate Conception",
      "type": "Special non-working day",
      "yearly": true
    },
    {
      "date": "2026-12-24",
      "name": "Christmas Eve",
      "type": "Special non-working day",
      "yearly": true
    },
    {
      "date": "2026-12-31",
      "name": "New Year's Eve",
      "type": "Special non-working day",
      "yearly": true
    },
    {
      "date": "2026-02-17",
      "name": "Chinese New Year",
      "type": "Special non-working day",
      "yearly": false
    },
    {
      "date": "2026-04-02",
      "name": "Maundy Thursday",
      "type": "Regular holiday",
      "yearly": false
    },
    {
      "date": "2026-04-03",
      "name": "Good Friday",
      "type": "Regular holiday",
      "yearly": false
    },
    {
      "date": "2026-04-04",
      "name": "Black Saturday",
      "type": "Special non-working day",
      "yearly": false
    },
    {
      "date": "2026-08-31",
      "name": "National Heroes Day",
      "type": "Regular holiday",
      "yearly": false
    },
    {
      "date": "2027-03-25",
      "name": "Maundy Thursday",
      "type": "Regular holiday",
      "yearly": false
    },
    {
      "date": "2027-03-26",
      "name": "Good Friday",
      "type": "Regular holiday",
      "yearly": false
    },
    {
      "date": "2027-03-27",
      "name": "Black Saturday",
      "type": "Special non-working day",
      "yearly": false
    },
    {
      "date": "2027-08-30",
      "name": "National Heroes Day",
      "type": "Regular holiday",
      "yearly": false
    }
  ]
};
