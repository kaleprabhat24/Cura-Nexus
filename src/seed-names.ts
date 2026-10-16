/** Name and geography tables for synthetic Indian patients (all fictional). */

export interface CityInfo {
  city: string;
  state: string;
  stateCode: string;
  pinPrefix: string;
  region: 'north' | 'west' | 'south' | 'east';
  localities: string[];
}

export const CITIES: CityInfo[] = [
  { city: 'Pune', state: 'Maharashtra', stateCode: 'MH', pinPrefix: '4110', region: 'west', localities: ['Kothrud', 'Shivaji Nagar', 'Aundh', 'Baner Road', 'Hadapsar', 'Viman Nagar', 'Kasba Peth', 'Karve Nagar', 'Wakad', 'Deccan Gymkhana'] },
  { city: 'Mumbai', state: 'Maharashtra', stateCode: 'MH', pinPrefix: '4000', region: 'west', localities: ['Dadar West', 'Andheri East', 'Ghatkopar', 'Borivali', 'Chembur', 'Bandra West'] },
  { city: 'Nashik', state: 'Maharashtra', stateCode: 'MH', pinPrefix: '4220', region: 'west', localities: ['College Road', 'Panchavati', 'Gangapur Road'] },
  { city: 'Nagpur', state: 'Maharashtra', stateCode: 'MH', pinPrefix: '4400', region: 'west', localities: ['Dharampeth', 'Sitabuldi', 'Manish Nagar'] },
  { city: 'Ahmedabad', state: 'Gujarat', stateCode: 'GJ', pinPrefix: '3800', region: 'west', localities: ['Navrangpura', 'Satellite', 'Maninagar'] },
  { city: 'Delhi', state: 'Delhi', stateCode: 'DL', pinPrefix: '1100', region: 'north', localities: ['Lajpat Nagar', 'Rohini Sector 9', 'Karol Bagh', 'Mayur Vihar'] },
  { city: 'Lucknow', state: 'Uttar Pradesh', stateCode: 'UP', pinPrefix: '2260', region: 'north', localities: ['Gomti Nagar', 'Aliganj', 'Hazratganj'] },
  { city: 'Jaipur', state: 'Rajasthan', stateCode: 'RJ', pinPrefix: '3020', region: 'north', localities: ['Malviya Nagar', 'Vaishali Nagar', 'C-Scheme'] },
  { city: 'Chennai', state: 'Tamil Nadu', stateCode: 'TN', pinPrefix: '6000', region: 'south', localities: ['Mylapore', 'T. Nagar', 'Adyar', 'Anna Nagar'] },
  { city: 'Bengaluru', state: 'Karnataka', stateCode: 'KA', pinPrefix: '5600', region: 'south', localities: ['Jayanagar', 'Indiranagar', 'Malleshwaram', 'Whitefield'] },
  { city: 'Hyderabad', state: 'Telangana', stateCode: 'TS', pinPrefix: '5000', region: 'south', localities: ['Banjara Hills', 'Kukatpally', 'Secunderabad'] },
  { city: 'Kochi', state: 'Kerala', stateCode: 'KL', pinPrefix: '6820', region: 'south', localities: ['Kadavanthra', 'Edappally', 'Fort Kochi'] },
  { city: 'Kolkata', state: 'West Bengal', stateCode: 'WB', pinPrefix: '7000', region: 'east', localities: ['Salt Lake', 'Ballygunge', 'Behala'] },
  { city: 'Bhubaneswar', state: 'Odisha', stateCode: 'OD', pinPrefix: '7510', region: 'east', localities: ['Saheed Nagar', 'Patia', 'Nayapalli'] },
  { city: 'Patna', state: 'Bihar', stateCode: 'BR', pinPrefix: '8000', region: 'east', localities: ['Boring Road', 'Kankarbagh', 'Rajendra Nagar'] },
];

export const STREETS = ['MG Road', 'Station Road', 'Gandhi Path', 'Nehru Marg', 'Tilak Road', 'Laxmi Road', 'Ambedkar Chowk', 'Temple Street', 'Lake View Road', 'Market Road'];

export const SURNAMES: Record<CityInfo['region'], string[]> = {
  north: ['Sharma', 'Verma', 'Gupta', 'Singh', 'Agarwal', 'Chauhan', 'Yadav', 'Malhotra', 'Kapoor', 'Saxena', 'Tiwari', 'Mishra'],
  west: ['Patil', 'Deshmukh', 'Kulkarni', 'Joshi', 'Shinde', 'Pawar', 'Jadhav', 'Mehta', 'Shah', 'Desai', 'Patel', 'Gokhale', 'Bhosale', 'Apte'],
  south: ['Iyer', 'Nair', 'Reddy', 'Rao', 'Krishnan', 'Menon', 'Pillai', 'Subramanian', 'Naidu', 'Gowda', 'Hegde', 'Raman'],
  east: ['Banerjee', 'Chatterjee', 'Das', 'Mukherjee', 'Ghosh', 'Sen', 'Bose', 'Mohanty', 'Sinha', 'Barua', 'Pradhan'],
};

export const MUSLIM_SURNAMES = ['Khan', 'Ansari', 'Siddiqui', 'Shaikh', 'Qureshi', 'Pathan'];
export const CHRISTIAN_SURNAMES = ["D'Souza", 'Fernandes', 'Thomas', 'George', 'Pereira'];

export const MALE: Record<'hindu' | 'muslim' | 'christian', string[]> = {
  hindu: ['Rohan', 'Vikram', 'Arjun', 'Suresh', 'Ramesh', 'Mahesh', 'Prakash', 'Anil', 'Sunil', 'Rajesh', 'Manoj', 'Deepak', 'Amit', 'Sanjay', 'Kiran', 'Srinivas', 'Karthik', 'Harish', 'Ganesh', 'Sachin', 'Nitin', 'Abhishek', 'Pradeep', 'Gopal', 'Mohan', 'Arun', 'Dinesh', 'Ashok', 'Vijay', 'Yogesh'],
  muslim: ['Imran', 'Farhan', 'Salman', 'Arif', 'Rizwan', 'Javed', 'Aamir', 'Tariq'],
  christian: ['Joseph', 'Anil', 'Francis', 'Thomas', 'Peter'],
};

export const FEMALE: Record<'hindu' | 'muslim' | 'christian', string[]> = {
  hindu: ['Priya', 'Sunita', 'Kavita', 'Meena', 'Anjali', 'Pooja', 'Neha', 'Rekha', 'Geeta', 'Savitri', 'Radha', 'Shalini', 'Deepa', 'Divya', 'Swati', 'Nandini', 'Padma', 'Usha', 'Vandana', 'Anita', 'Shobha', 'Jyoti', 'Kamala', 'Sarita', 'Bhavna', 'Ritu', 'Mamta', 'Seema', 'Archana', 'Vaishali'],
  muslim: ['Ayesha', 'Zainab', 'Fatima', 'Nasreen', 'Sana', 'Rukhsar', 'Shabana'],
  christian: ['Mary', 'Grace', 'Teresa', 'Agnes', 'Lydia'],
};
