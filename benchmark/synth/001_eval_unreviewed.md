# Offline labelled questions: search + decision (1056 questions)

Questions: `questions_001.json` written by a local model (gemma4:26b, 2026-11-07). Engine: the page's JS twin of the search and decideTier (= Rust).
**No human review yet** - the labels are the model's; read every number as an estimate with unknown label noise (run review.mjs, fill the sheet).

| set | n | right entry 1st | 1st, duplicates count (Y / Y+partial) | in top 3 | answered (act) | answered with a WRONG entry |
|---|---|---|---|---|---|---|
| para_th | 528 | 52.3% (276/528) | 52.7% (278/528) / 53.8% (284/528) | 69.7% (368/528) | 57.0% (301/528) | 19.1% (101/528) |
| para_en | 264 | 48.5% (128/264) | 49.2% (130/264) / 51.1% (135/264) | 67.4% (178/264) | 63.6% (168/264) | 23.1% (61/264) |
| near_miss | 264 | - | - | - | 62.5% (165/264) | 22.0% (58/264) (with the very entry that does not answer it) |

Reading: for near_miss, "answered" counts every act; a near-miss may still be answered correctly by ANOTHER entry until a review says otherwise, so "answered with the very entry that does not answer it" is the solid lower bound of wrong answers.

**Entries whose Thai paraphrases are found first in at most 1 of 4 (46):** `change_name` 0/4, `english_submit_score` 0/4, `gm_application_documents_upload` 0/4, `gm_application_fee` 0/4, `gm_application_overview` 0/4, `gm_english_requirements_sources` 0/4, `gm_registration_2569` 0/4, `gm_registration_2569_second_semester` 0/4, `gm_registration_2570_second` 0/4, `gm_registration_exemption_2570` 0/4, `gm_registration_payment_rules` 0/4, `gm_sample_2018DG00_2570_eligibility` 0/4, `gm_selection_and_new_student_reporting` 0/4, `gm_softskills_voluntary_2569` 0/4, `gm_thesis_submission_13_review_time` 0/4, `gm_thesis_submission_14_signoff` 0/4, `gm_welfare_directory` 0/4, `suspend_general` 0/4, `thesis_signature` 0/4, `thesis_submit_steps` 0/4, `thesis_time_plan` 0/4, `thesis_topic_process` 0/4, `thesis_turnitin` 0/4, `account_locked_it` 1/4, `admission_fee` 1/4, `admission_how` 1/4, `admission_programs` 1/4, `best_scores` 1/4, `contact_line` 1/4, `gm_forms_directory` 1/4, `gm_programme_availability` 1/4, `gm_registration_2569_summer` 1/4, `gm_registration_2570_first` 1/4, `gm_registration_2570_summer` 1/4, `gm_registration_forms` 1/4, `gm_registration_graduation` 1/4, `gm_registration_services` 1/4, `gm_service_overview` 1/4, `gm_thesis_submission_04_references` 1/4, `gm_thesis_submission_08_turnitin` 1/4, `gm_thesis_submission_10_deadline` 1/4, `gm_thesis_submission_12_upload_documents` 1/4, `grid_system_down` 1/4, `mugrad_result_days` 1/4, `thesis_check_signoff` 1/4, `toefl_itp_result` 1/4.
These are candidates for better titles / keywords, not proof: check the paraphrases first.
