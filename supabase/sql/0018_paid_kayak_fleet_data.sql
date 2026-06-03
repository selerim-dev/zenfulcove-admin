-- Paid rental fleet data cleanup.
-- Idempotent: safe to run more than once.

update public.kayaks
set
  code = case name
    when 'Rental #5' then '6421'
    when 'Rental #6' then '2352'
    when 'Rental #7' then '1556'
    when 'Rental #8' then '3022'
    when 'Rental #9' then '5256'
    else code
  end,
  length_feet = case name
    when 'Rental #7' then 12
    else length_feet
  end,
  display_order = case name
    when 'Rental #5' then 5
    when 'Rental #6' then 6
    when 'Rental #7' then 7
    when 'Rental #8' then 8
    when 'Rental #9' then 9
    else display_order
  end
where name in (
  'Rental #5',
  'Rental #6',
  'Rental #7',
  'Rental #8',
  'Rental #9'
);
